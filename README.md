# Remove BMP and Attached Pictures for Tdarr

**Clean out unwanted image streams. Keep the video you meant to keep.**

A single-file Tdarr Classic plugin that removes BMP streams and embedded cover art, then copies the remaining streams into MKV without re-encoding. It selects targets from FFprobe's stream information, so an ordinary third video track is kept.

[![Plugin tests](https://github.com/SeanRiggs/Tdarr_Plugin_Remove_BMP/actions/workflows/test.yml/badge.svg)](https://github.com/SeanRiggs/Tdarr_Plugin_Remove_BMP/actions/workflows/test.yml)

## What it removes

| FFprobe reports | Action |
| --- | --- |
| Video stream with `codec_name: bmp` | Remove that stream. |
| Video stream with `disposition.attached_pic` enabled | Remove that stream, including PNG/JPEG cover art. |
| Attachment with MIME type `image/bmp` or `image/x-ms-bmp` | Remove that BMP attachment. |
| Ordinary video, including a third video track | Keep it. |
| Audio, subtitles, fonts, and other file attachments | Keep them. |

The plugin maps all streams first, excludes only identified targets by their absolute stream indexes, and uses `-c copy`. It requests preservation of global metadata and chapters. It does not classify an unflagged PNG/MJPEG video track as cover art just because of its codec, and it does not identify attachments by filename alone.

**Files with no targets are skipped.** The plugin also skips missing/failed scans, invalid or duplicate stream indexes, non-video files, and removals that would leave no regular video stream. The skip reason appears in Tdarr's plugin log. A cleaned file passes through again without another remux.

## Install or upgrade

1. Download [Tdarr_Plugin_Sean_Remove_BMP.js](https://raw.githubusercontent.com/SeanRiggs/Tdarr_Plugin_Remove_BMP/main/Tdarr_Plugin_Sean_Remove_BMP.js). Save the raw JavaScript file, not the GitHub HTML page.
2. Copy it into the **Local** directory inside your Tdarr Server's **Plugins** directory. For Docker, use the corresponding persistent host folder mapped into your server container; the host path depends on your deployment.
3. In Tdarr's **Plugins** tab, find the local plugin with ID `Tdarr_Plugin_Sean_Remove_BMP` and version `2.0.0`.
4. Add it as a **Local** plugin in your library's transcode plugin stack, before steps that need the image streams removed.
5. Process a copy of a representative video first and inspect the output and job report before enabling it across a library.

There are no plugin inputs, npm dependencies, GPU requirements, or separate Docker images to install. Tdarr supplies FFprobe data and runs FFmpeg. Only the `.js` file is needed on the server.

When upgrading, replace the existing local file while its jobs are idle. Keep the filename and plugin ID unchanged, and verify that Tdarr displays version `2.0.0` before running it. The earlier single-function export has been replaced with the documented `details()` and `plugin()` exports.

### Using a Tdarr Flow

Use Tdarr's **Run Classic Transcode Plugin** flow node and select:

```text
Local:Tdarr_Plugin_Sean_Remove_BMP
```

Connect both outcomes: **1** means processing occurred; **2** means the plugin skipped processing. Use the flow's normal review/output/replacement steps as appropriate. This repository provides a Classic plugin that can be called from a Flow, rather than a separate native Flow plugin.

## Behavior and limits

- Output is MKV when cleanup runs. Clean files keep their current container because they are skipped; this is not a general-purpose container converter.
- BMP-encoded video is a removal target, even if it contains moving pictures. Keep this plugin out of libraries where those tracks are intentional. It refuses removal when no regular video would remain.
- A BMP attachment without a recognized MIME type is left alone. Rescan missing or incomplete stream information instead of guessing stream indexes.
- Retained streams must be supported by the MKV muxer. FFmpeg can fail on incompatible codecs or data tracks; the plugin does not silently drop those streams to force success.
- Container conversion can change container-specific metadata, timestamps, or file size. Stream copying does not mean the entire output file will be byte-identical.
- Tdarr manages cache files and replacement of originals. Review those settings and keep backups before a bulk run. This plugin does not directly delete or modify source files.

## Tests

For development, install Node.js 22 or newer and put `ffmpeg` and `ffprobe` on your PATH. No `npm install` is required.

```bash
npm test
```

Run a subset with `npm run test:unit` or `npm run test:media`. The media tests also accept `FFMPEG_PATH` and `FFPROBE_PATH` environment variables for custom binary locations.

The suite covers stream selection, cover-art flags, BMP attachment MIME types, invalid scan data, source preservation, and repeat-run skipping. It generates tiny MP4/MKV fixtures locally, executes the plugin's returned FFmpeg arguments, and compares packet hashes to check that retained media was not re-encoded. It also checks subtitle language/forced flags, chapters, a title, and attachment content. Tests use temporary folders and no personal media or network services.

GitHub Actions runs the suite on Node.js 22 and 24. Compatibility follows Tdarr's documented Classic API and its Classic-to-Flow adapter; these tests do not launch a full Tdarr Server/Node installation.

## Contributing

Found a stream layout that behaves differently? Open an [issue](https://github.com/SeanRiggs/Tdarr_Plugin_Remove_BMP/issues) with your Tdarr/FFmpeg versions, the relevant FFprobe stream records, and the plugin log. Remove personal filenames, paths, and private URLs before sharing.

Focused improvements are welcome: add a failing synthetic fixture, make the smallest correction, and run `npm test`. Preserve unrelated tracks and the skip-on-second-pass behavior. Do not add broad codec-removal rules or hard-coded stream positions without an explicit, tested reason.

See [CHANGELOG.md](CHANGELOG.md) for release changes. Useful upstream references:

- [Tdarr Classic plugin basics](https://docs.tdarr.io/docs/plugins/classic-plugins/basics/)
- [Installing a local plugin in a stack](https://docs.tdarr.io/docs/library-setup/transcode-options/plugin-stack/)
- [Run Classic Transcode Plugin in a Flow](https://docs.tdarr.io/docs/plugins/flow-plugins/index/classic/Run%20Classic%20Transcode%20Plugin/)
- [FFmpeg stream mapping](https://ffmpeg.org/ffmpeg.html#Advanced-options)
