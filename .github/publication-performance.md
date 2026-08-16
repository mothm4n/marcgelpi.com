# Publication performance budget

Publication time is measured from the first build-job timing step immediately before checkout through completed GitHub Pages deployment. Each phase records integer wall-clock seconds immediately before and after the existing command or action. Acceptance reports the same measurement per journey. A Hugo build is one Hugo invocation counted when it starts, including fixture-specific builds that later fail as expected.

The reviewed baseline is **10:19 total**, including **9:15 acceptance**. The target is **below 3:00** total publication time, measured the same way across five representative successful GitHub Actions runs.

Timing records contain only fixed phase or journey names and integer durations. They do not include command output, environment values, content, URLs, or credentials. Instrumentation observes the existing gates; it does not replace, skip, or alter them.

## Browser installation

Run #13 established the pre-#38 CI baseline: browser setup took 28 seconds and downloaded 300.9 MiB of browser payloads (184.7 MiB full Chromium, 113.9 MiB headless shell, and 2.3 MiB FFmpeg). CI now requests only the Chromium headless shell and FFmpeg. Every run publishes its measured setup duration and downloaded size beside that baseline.

Headless-only CI does not remove headed local development. Install full Chromium explicitly, start a local Hugo server, and open its URL in the headed Playwright browser:

```sh
npm run browser:install-headed
hugo server --buildDrafts
npm run browser:open-headed -- http://localhost:1313
```
