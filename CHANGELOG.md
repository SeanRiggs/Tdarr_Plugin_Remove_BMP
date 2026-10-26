# Changelog

## 2.0.0 — 2026-10-26

- Export the documented Tdarr Classic `details()` and `plugin()` functions and return a standard FFmpeg worker response.
- Replace fixed-position removal with absolute FFprobe indexes for BMP video, attached pictures, and BMP attachments identified by MIME type.
- Preserve ordinary third video tracks, other streams, metadata, and chapters through stream copying into MKV.
- Skip clean files and invalid scans, and refuse cleanup that would remove every regular video track.
- Add unit tests, real FFmpeg/FFprobe integration fixtures, and GitHub Actions checks on Node.js 22 and 24.
- Document local installation, upgrades, Flow usage, limits, testing, and contributions.

The plugin filename and ID remain `Tdarr_Plugin_Sean_Remove_BMP`. Replace the previous local file and verify version `2.0.0` in Tdarr before using it.
