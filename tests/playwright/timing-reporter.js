const fs = require('node:fs');
const path = require('node:path');

function journeyName(title) {
  return title === 'English production site shell'
    ? 'site-shell'
    : title.replace(/ journey$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

class TimingReporter {
  onBegin() {
    if (process.env.PLAYWRIGHT_TIMINGS) {
      fs.writeFileSync(process.env.PLAYWRIGHT_TIMINGS, '');
    }
    if (process.env.PLAYWRIGHT_FAILURE_SUMMARY) {
      fs.mkdirSync(path.dirname(process.env.PLAYWRIGHT_FAILURE_SUMMARY), { recursive: true });
      fs.writeFileSync(
        process.env.PLAYWRIGHT_FAILURE_SUMMARY,
        'journey\tfile\tline\tstatus\tduration_ms\tretry\n',
      );
    }
  }

  onTestEnd(test, result) {
    const journey = journeyName(test.title);
    if (process.env.PLAYWRIGHT_FAILURE_SUMMARY && result.status !== test.expectedStatus) {
      fs.appendFileSync(
        process.env.PLAYWRIGHT_FAILURE_SUMMARY,
        [
          journey,
          path.basename(test.location.file),
          test.location.line,
          result.status,
          Math.max(0, Math.round(result.duration)),
          result.retry,
        ].join('\t') + '\n',
      );
    }

    if (!process.env.PLAYWRIGHT_TIMINGS || result.status !== test.expectedStatus) {
      return;
    }

    const seconds = Math.max(1, Math.ceil(result.duration / 1000));
    fs.appendFileSync(process.env.PLAYWRIGHT_TIMINGS, `${journey}\t${seconds}\n`);
  }
}

module.exports = TimingReporter;
