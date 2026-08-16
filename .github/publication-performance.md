# Publication performance budget

Publication time is measured from the first build-job timing step immediately before checkout through completed GitHub Pages deployment. Each phase records integer wall-clock seconds immediately before and after the existing command or action. Acceptance reports the same measurement per journey. A Hugo build is one Hugo invocation counted when it starts, including fixture-specific builds that later fail as expected.

The reviewed baseline is **10:19 total**, including **9:15 acceptance**. The target is **below 3:00** total publication time, measured the same way across five representative successful GitHub Actions runs.

Timing records contain only fixed phase or journey names and integer durations. They do not include command output, environment values, content, URLs, or credentials. Instrumentation observes the existing gates; it does not replace, skip, or alter them.
