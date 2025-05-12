module.exports = function (lib, queueItem, inputFile, outputFile) {
  return {
    info: {
      name: 'Remove BMP Streams',
      description: 'Removes bmp and attached_pic streams before remuxing to MKV.',
      version: 1,
      author: 'Alethea-for-Sean 💋'
    },
    run: function () {
      return lib.ffmpegCommand({
        videoCodec: 'copy',
        audioCodec: 'copy',
        container: 'mkv',
        ffmpegMode: 'custom',
        customCommand: `-map 0 -map -0:v:m:attached_pic -map -0:v:2 -c copy`
      });
    }
  };
};
