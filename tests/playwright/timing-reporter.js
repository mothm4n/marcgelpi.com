const fs = require('node:fs');

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
  }

  onTestEnd(test, result) {
    if (!process.env.PLAYWRIGHT_TIMINGS || result.status !== test.expectedStatus) {
      return;
    }

    const journey = journeyName(test.title);
    const seconds = Math.max(1, Math.ceil(result.duration / 1000));
    fs.appendFileSync(process.env.PLAYWRIGHT_TIMINGS, `${journey}\t${seconds}\n`);
  }
}

module.exports = TimingReporter;
