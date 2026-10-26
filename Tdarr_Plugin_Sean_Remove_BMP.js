'use strict';

const details = () => ({
  id: 'Tdarr_Plugin_Sean_Remove_BMP',
  Stage: 'Pre-processing',
  Name: 'Remove BMP and Attached Pictures',
  Type: 'Video',
  Operation: 'Transcode',
  Description: 'Remove BMP video streams, BMP file attachments, and video streams marked as attached pictures. '
    + 'Copy the remaining streams into MKV without re-encoding. '
    + 'Skip clean files and files that would lose every regular video stream.',
  Version: '2.0.0',
  Tags: 'pre-processing,ffmpeg,video only',
  Inputs: [],
});

const isAttachedPicture = (stream) => {
  const value = stream.disposition && stream.disposition.attached_pic;
  return value === 1 || value === '1' || value === true;
};

const isRemovalTarget = (stream) => {
  if (stream.codec_type.toLowerCase() === 'video') {
    return stream.codec_name.toLowerCase() === 'bmp' || isAttachedPicture(stream);
  }
  if (stream.codec_type.toLowerCase() === 'attachment') {
    const mime = stream.tags && stream.tags.mimetype;
    return typeof mime === 'string'
      && ['image/bmp', 'image/x-ms-bmp'].includes(mime.toLowerCase());
  }
  return false;
};

// Tdarr supplies the scanned file and manages execution, cache files, and replacement.
const plugin = (file) => {
  const response = {
    processFile: false,
    preset: '',
    container: '.mkv',
    handBrakeMode: false,
    FFmpegMode: true,
    reQueueAfter: true,
    infoLog: '',
  };

  if (!file || (file.ffProbeRead !== undefined && file.ffProbeRead !== 'success')) {
    response.infoLog = 'Skipped: a successful FFprobe scan is required.\n';
    return response;
  }
  if (file.fileMedium && file.fileMedium !== 'video') {
    response.infoLog = 'Skipped: this plugin processes video files only.\n';
    return response;
  }

  const streams = file.ffProbeData && file.ffProbeData.streams;
  if (!Array.isArray(streams) || streams.length === 0) {
    response.infoLog = 'Skipped: FFprobe stream information is missing or empty.\n';
    return response;
  }

  // Never substitute array positions for FFprobe's absolute stream indexes.
  const indexes = new Set();
  for (const stream of streams) {
    if (!stream || !Number.isSafeInteger(stream.index) || stream.index < 0
      || indexes.has(stream.index) || typeof stream.codec_type !== 'string'
      || stream.codec_type.length === 0
      || (stream.codec_type.toLowerCase() === 'video'
        && (typeof stream.codec_name !== 'string' || stream.codec_name.length === 0))) {
      response.infoLog = 'Skipped: incomplete, invalid, or duplicate FFprobe stream data; rescan the file.\n';
      return response;
    }
    indexes.add(stream.index);
  }

  const targets = streams.filter(isRemovalTarget);
  if (targets.length === 0) {
    response.infoLog = 'No BMP streams, BMP attachments, or attached pictures found; no processing needed.\n';
    return response;
  }
  if (!streams.some((stream) => stream.codec_type.toLowerCase() === 'video'
    && !isRemovalTarget(stream))) {
    response.infoLog = 'Skipped: removal would leave no regular video stream.\n';
    return response;
  }

  const removals = targets.map((stream) => `-map -0:${stream.index}`).join(' ');
  // The comma separates Tdarr's FFmpeg input and output arguments.
  // Keep all streams first, then remove only the positively identified targets.
  response.preset = `,-map 0 ${removals} -map_metadata 0 -map_chapters 0 -c copy`;
  response.processFile = true;
  response.infoLog = `Removing stream indexes: ${targets.map((stream) => stream.index).join(', ')}. `
    + 'Copying remaining streams to MKV without re-encoding.\n';
  return response;
};

module.exports.details = details;
module.exports.plugin = plugin;
