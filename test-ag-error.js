const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log('BROWSER:', msg.text());
    }
  });
  await page.goto('http://localhost:3000/stocks');
  await new Promise(r => setTimeout(r, 4000));
  await browser.close();
})();
