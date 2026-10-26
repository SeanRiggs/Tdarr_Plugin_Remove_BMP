'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { details, plugin } = require('../Tdarr_Plugin_Sean_Remove_BMP');

const video = (index, codec_name = 'h264', attached_pic = 0) => ({
  index, codec_type: 'video', codec_name, disposition: { attached_pic },
});
const file = (streams, extra = {}) => ({
  container: 'mp4', fileMedium: 'video', ffProbeRead: 'success',
  ffProbeData: { streams }, ...extra,
});
const removed = (result) => [...result.preset.matchAll(/-map -0:(\d+)/g)]
  .map((match) => Number(match[1]));
const skipped = (input, reason) => {
  const result = plugin(input, {}, {}, {});
  assert.equal(result.processFile, false);
  assert.equal(result.preset, '');
  assert.match(result.infoLog, reason);
};

test('exports Tdarr Classic metadata and a worker response', () => {
  assert.equal(details().id, 'Tdarr_Plugin_Sean_Remove_BMP');
  assert.equal(details().Operation, 'Transcode');
  assert.equal(details().Stage, 'Pre-processing');
  const response = plugin(file([video(0), video(1, 'bmp')]));
  assert.equal(response.processFile, true);
  assert.equal(response.container, '.mkv');
  assert.equal(response.FFmpegMode, true);
  assert.equal(response.handBrakeMode, false);
  assert.equal(response.reQueueAfter, true);
  assert.ok(response.preset.startsWith(','));
});

test('preserves a clean third video stream and skips unnecessary remuxing', () => {
  skipped(file([video(0), video(1, 'hevc'), video(2, 'mjpeg')]), /no processing needed/);
});

test('removes BMP by its absolute index, not its position or video ordinal', () => {
  const result = plugin(file([
    { index: 8, codec_type: 'audio', codec_name: 'aac' },
    video(12, 'BMP'), video(4), video(15), video(20),
  ]));
  assert.deepEqual(removed(result), [12]);
});

test('removes BMP at any video position while preserving the other three', () => {
  for (let position = 0; position < 4; position += 1) {
    const streams = [video(0), video(1), video(2), video(3)];
    streams[position].codec_name = 'bmp';
    assert.deepEqual(removed(plugin(file(streams))), [position]);
  }
});

test('recognizes numeric, string, and boolean attached-picture flags', () => {
  for (const flag of [1, '1', true]) {
    assert.deepEqual(removed(plugin(file([video(0), video(5, 'png', flag)]))), [5]);
  }
});

test('does not mistake false flags or image codecs alone for attached art', () => {
  for (const flag of [0, '0', false, undefined]) {
    skipped(file([video(0, 'mjpeg', flag), video(1, 'png', flag)]), /no processing needed/);
  }
});

test('removes multiple targets only once and keeps non-video streams', () => {
  const input = file([
    video(0), video(1, 'bmp', 1), video(2, 'png', 1),
    { index: 3, codec_type: 'audio', codec_name: 'aac' },
    { index: 4, codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle' },
    { index: 5, codec_type: 'attachment', codec_name: 'ttf' },
    { index: 6, codec_type: 'data' },
  ]);
  const before = JSON.stringify(input);
  const response = plugin(input);
  assert.deepEqual(removed(response), [1, 2]);
  assert.match(response.preset, /-map 0 /);
  assert.match(response.preset, /-map_metadata 0 -map_chapters 0 -c copy$/);
  assert.equal(JSON.stringify(input), before);
});

test('uses attached_pic disposition rather than a similarly named metadata tag', () => {
  skipped(file([{ ...video(0), tags: { attached_pic: '1' } }]), /no processing needed/);
});

test('recognizes BMP attachments by MIME type, preserving fonts and other attachments', () => {
  const result = plugin(file([
    video(0),
    { index: 2, codec_type: 'attachment', tags: { mimetype: 'image/bmp' } },
    { index: 3, codec_type: 'attachment', tags: { mimetype: 'IMAGE/X-MS-BMP' } },
    { index: 4, codec_type: 'attachment', tags: { mimetype: 'application/x-truetype-font' } },
    { index: 5, codec_type: 'attachment', tags: { filename: 'cover.bmp', mimetype: 'text/plain' } },
    { index: 6, codec_type: 'attachment' },
  ]));
  assert.deepEqual(removed(result), [2, 3]);
});

test('skips files that would lose every regular video stream', () => {
  skipped(file([video(0, 'bmp'), video(1, 'png', 1),
    { index: 2, codec_type: 'audio', codec_name: 'aac' }]), /no regular video/);
});

test('skips audio libraries even if they include album art', () => {
  skipped(file([video(0, 'mjpeg', 1)], { fileMedium: 'audio' }), /video files only/);
});

test('handles missing or unsuccessful FFprobe scans without generating a command', () => {
  for (const input of [undefined, null, {}, { ffProbeData: {} }, file([]),
    file([video(0), video(1, 'bmp')], { ffProbeRead: 'error' }),
    file([video(0), video(1, 'bmp')], { ffProbeRead: false })]) {
    skipped(input, /Skipped:/);
  }
});

test('rejects missing, duplicate, negative, fractional, or injected indexes', () => {
  for (const index of [undefined, null, '1', -1, 1.5, NaN, Infinity,
    Number.MAX_SAFE_INTEGER + 1, '1 -map -0:0', 0]) {
    skipped(file([video(0), video(index, 'bmp')]), /invalid|duplicate/);
  }
});

test('skips incomplete stream records instead of guessing what to remove', () => {
  for (const stream of [null, {}, { index: 4 }, { index: 4, codec_type: 1 },
    { index: 4, codec_type: 'video' }, { index: 4, codec_type: 'video', codec_name: '' }]) {
    skipped(file([video(0), video(1, 'bmp'), stream]), /incomplete/);
  }
});

test('a second pass over cleaned stream data performs no work', () => {
  const streams = [video(0), video(4, 'bmp'), video(6, 'png', 1), video(8)];
  const toRemove = removed(plugin(file(streams)));
  skipped(file(streams.filter((stream) => !toRemove.includes(stream.index))), /no processing needed/);
});
