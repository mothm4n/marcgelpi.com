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

## Hugo cache experiment

Issue #39 tested persisting Hugo's file cache with a key containing the runner operating system, Hugo 0.164.0, and the Git object IDs for `config`, `assets`, `content`, `data`, `layouts`, `static`, and the Blowfish theme. [Run #16](https://github.com/mothm4n/marcgelpi.com/actions/runs/31943674379) established the uncached final-build baseline and saved the cache only after acceptance, release verification, and artifact upload succeeded. [Runs #17](https://github.com/mothm4n/marcgelpi.com/actions/runs/31944212036), [#18](https://github.com/mothm4n/marcgelpi.com/actions/runs/31944720486), and [#19](https://github.com/mothm4n/marcgelpi.com/actions/runs/31945224013) each reported an exact cache hit on that compatible key.

| Run | Restore | Build | Restore + build | Improvement |
| --- | ---: | ---: | ---: | ---: |
| Cold #16 | 0 ms | 208 ms | 208 ms | baseline |
| Warm #17 | 314 ms | 221 ms | 535 ms | -157.2% |
| Warm #18 | 1,003 ms | 211 ms | 1,214 ms | -483.7% |
| Warm #19 | 1,003 ms | 162 ms | 1,165 ms | -460.1% |

All four runs passed the complete acceptance suite with 28 Hugo invocations, production build, release verification, artifact upload, and deployment. The cold and warm production artifacts had the same content digest, `e33452b13d7719f97057c26f5b7af6ecf1251f76d1405204d21f21e0cac80c7c`.

The median warm improvement was **-460.1%**, below the required 10% gain. Acceptance already warms Hugo's temporary cache before the final production build, so restoring the small persistent cache added more time than it saved. The persistence experiment was therefore removed; CI retains Hugo's per-run temporary cache without adding restore or save actions.
