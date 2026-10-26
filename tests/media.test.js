'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { plugin } = require('../Tdarr_Plugin_Sean_Remove_BMP');

let directory;
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const run = (executable, args) => {
  const result = spawnSync(executable, args, {
    encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${executable} failed:\n${result.stderr}`);
  return result.stdout;
};
const encode = (args) => run(ffmpeg, [
  '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
  '-filter_threads', '1', '-filter_complex_threads', '1', ...args,
]);
const probe = (name) => JSON.parse(run(ffprobe, [
  '-v', 'error', '-show_streams', '-show_format', '-show_chapters',
  '-show_data_hash', 'sha256', '-of', 'json', name,
]));
const tdarrFile = (name, data) => ({
  _id: name, file: name, container: path.extname(name).slice(1), fileMedium: 'video',
  ffProbeRead: 'success', ffProbeData: data,
});
const hashFile = (name) => createHash('sha256').update(fs.readFileSync(name)).digest('hex');
const packetHashes = (name, index) => JSON.parse(run(ffprobe, [
  '-v', 'error', '-select_streams', String(index), '-show_packets',
  '-show_data_hash', 'sha256', '-show_entries', 'packet=data_hash', '-of', 'json', name,
])).packets.map((packet) => packet.data_hash);

before(() => {
  run(ffmpeg, ['-version']);
  run(ffprobe, ['-version']);
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tdarr bmp tests '));
  fs.writeFileSync(path.join(directory, 'captions.srt'), '1\n00:00:00,000 --> 00:00:00,900\nKeep this subtitle.\n');
  fs.writeFileSync(path.join(directory, 'notes.txt'), 'Preserve this ordinary file attachment.\n');
  fs.writeFileSync(path.join(directory, 'chapters.txt'),
    ';FFMETADATA1\ntitle=Preserve this title\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=900\ntitle=Opening\n');
});
after(() => {
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

const remux = (input, output, data) => {
  const originalHash = hashFile(input);
  const response = plugin(tdarrFile(input, data), {}, {}, {});
  assert.equal(response.processFile, true, response.infoLog);
  assert.equal(response.container, '.mkv');
  const [inputArgs, outputArgs] = response.preset.split(',');
  assert.equal(inputArgs, '');
  // Match Tdarr's input/output separator. Arguments contain only validated indexes and constants.
  encode(['-i', input, ...outputArgs.trim().split(/\s+/), output]);
  assert.equal(hashFile(input), originalHash, 'the source file must remain unchanged');
  const cleaned = probe(output);
  assert.equal(plugin(tdarrFile(output, cleaned)).processFile, false, 'a second pass must skip');
  return cleaned;
};

test('real MKV: remove a BMP attachment; preserve three videos, audio, subtitles, chapters, and other attachments', () => {
  const cover = path.join(directory, 'cover.bmp');
  encode(['-f', 'lavfi', '-i', 'color=c=blue:s=32x32', '-frames:v', '1', '-threads:v', '1', cover]);
  const input = path.join(directory, 'bmp-attachment.mkv');
  const output = path.join(directory, 'clean-attachment.mkv');
  const args = [];
  for (const color of ['red', 'green', 'yellow']) {
    args.push('-f', 'lavfi', '-i', `color=c=${color}:s=32x32:r=2:d=1`);
  }
  args.push('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=8000:duration=1',
    '-i', path.join(directory, 'captions.srt'), '-f', 'ffmetadata', '-i', path.join(directory, 'chapters.txt'),
    '-map', '0:v', '-map', '3:a', '-map', '1:v', '-map', '2:v', '-map', '4:s',
    '-map_metadata', '5', '-map_chapters', '5', '-c:v', 'ffv1', '-threads:v', '1',
    '-c:a', 'pcm_s16le', '-c:s', 'srt', '-metadata:s:a:0', 'language=eng',
    '-metadata:s:s:0', 'language=spa', '-disposition:s:0', 'forced',
    '-attach', cover, '-metadata:s:t:0', 'mimetype=image/bmp',
    '-attach', path.join(directory, 'notes.txt'), '-metadata:s:t:1', 'mimetype=text/plain',
    '-metadata:s:t:1', 'filename=notes.txt', input);
  encode(args);
  const source = probe(input);
  const targets = source.streams.filter((stream) => stream.tags?.mimetype === 'image/bmp');
  assert.equal(targets.length, 1, 'fixture must actually contain a BMP attachment');
  const retained = source.streams.filter((stream) => !targets.includes(stream));
  const cleaned = remux(input, output, source);
  assert.deepEqual(cleaned.streams.map((stream) => stream.codec_type), retained.map((stream) => stream.codec_type));
  assert.deepEqual(cleaned.streams.map((stream) => stream.codec_name), retained.map((stream) => stream.codec_name));
  assert.equal(cleaned.streams.filter((stream) => stream.codec_type === 'video').length, 3);
  assert.equal(cleaned.format.tags.title, source.format.tags.title);
  assert.deepEqual(cleaned.chapters.map((chapter) => [chapter.start_time, chapter.end_time, chapter.tags.title]),
    source.chapters.map((chapter) => [chapter.start_time, chapter.end_time, chapter.tags.title]));
  retained.forEach((stream, position) => {
    const copy = cleaned.streams[position];
    if (stream.codec_type === 'attachment') {
      assert.equal(copy.extradata_hash, stream.extradata_hash);
      assert.ok(stream.extradata_hash);
      assert.equal(copy.tags.filename, stream.tags.filename);
    } else {
      const originalPackets = packetHashes(input, stream.index);
      assert.ok(originalPackets.length > 0);
      assert.deepEqual(packetHashes(output, copy.index), originalPackets,
        `stream ${stream.index} payload changed`);
    }
    if (stream.tags && stream.tags.language) assert.equal(copy.tags.language, stream.tags.language);
    if (stream.codec_type === 'subtitle') assert.equal(copy.disposition.forced, 1);
  });
});

for (const imageFormat of ['png', 'bmp']) {
  test(`real MP4: remove ${imageFormat} attached art; preserve three regular videos and audio`, () => {
    const cover = path.join(directory, `cover.${imageFormat}`);
    encode(['-f', 'lavfi', '-i', 'color=c=blue:s=32x32', '-frames:v', '1', '-threads:v', '1', cover]);
    const input = path.join(directory, `with-${imageFormat}-cover.mp4`);
    const output = path.join(directory, `without-${imageFormat}-cover.mkv`);
    const args = [];
    for (const color of ['red', 'green', 'yellow']) {
      args.push('-f', 'lavfi', '-i', `color=c=${color}:s=32x32:r=2:d=1`);
    }
    args.push('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=8000:duration=1', '-i', cover,
      '-map', '0:v', '-map', '3:a', '-map', '1:v', '-map', '2:v', '-map', '4:v',
      '-c:v', 'mpeg4', '-threads:v', '1', '-c:v:3', 'copy', '-c:a', 'aac',
      '-disposition:v:3', 'attached_pic', input);
    encode(args);
    const source = probe(input);
    const covers = source.streams.filter((stream) => stream.disposition.attached_pic === 1);
    assert.equal(covers.length, 1);
    assert.equal(covers[0].codec_name, imageFormat);
    const retained = source.streams.filter((stream) => stream.disposition.attached_pic !== 1);
    const cleaned = remux(input, output, source);
    assert.equal(cleaned.streams.filter((stream) => stream.codec_type === 'video').length, 3);
    assert.deepEqual(cleaned.streams.map((stream) => stream.codec_name), retained.map((stream) => stream.codec_name));
    retained.forEach((stream, position) => {
      assert.deepEqual(packetHashes(output, cleaned.streams[position].index), packetHashes(input, stream.index));
    });
  });
}

test('real clean video: no remux command and no source modification', () => {
  const input = path.join(directory, 'already-clean.mkv');
  encode(['-f', 'lavfi', '-i', 'color=c=red:s=32x32:r=2:d=1', '-c:v', 'ffv1', '-threads:v', '1', input]);
  const originalHash = hashFile(input);
  const response = plugin(tdarrFile(input, probe(input)));
  assert.equal(response.processFile, false);
  assert.equal(response.preset, '');
  assert.equal(hashFile(input), originalHash);
});
