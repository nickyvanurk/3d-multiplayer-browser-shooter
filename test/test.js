/**
 * Adds 10 player to the scene
 */

const puppeteer = require('puppeteer');
const playerCount = 1;

process.stdin.setRawMode(true);
process.stdin.resume();

(async () => {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 400, height: 300 }
  });

  const randomTime = () => {
    return Math.random() * 200 + 100;
  };

  const goRight = async page => {
    await page.keyboard.up('KeyS');
    await page.keyboard.down('KeyF');
    await page.waitForTimeout(randomTime());
  };

  const goLeft = async page => {
    await page.keyboard.up('KeyF');
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(randomTime());
  };

  const goUp = async page => {
    await page.keyboard.up('Delete');
    await page.keyboard.down('Backspace');
    await page.waitForTimeout(randomTime());
  };

  const goDown = async page => {
    await page.keyboard.up('Backspace');
    await page.keyboard.down('Delete');
    await page.waitForTimeout(randomTime());
  };

  const newPage = async () => {
    try {
      const page = await browser.newPage();
      await page.setDefaultNavigationTimeout(0);
      await page.goto('http://localhost:8080/');

      await page.waitForTimeout(randomTime() + 5000);

      let run = true;

      while (run) {
        await page.keyboard.down('KeyE');
        await page.keyboard.down('ShiftLeft');
        await page.mouse.move(200, 275);
        await page.waitForTimeout(2000);
        await page.mouse.move(100, 275);
        await page.waitForTimeout(2000);
        await page.mouse.move(200, 275);
        await page.waitForTimeout(2000);
        await page.mouse.move(300, 275);

        process.stdin.on('data', () => run = false);
      }

      await browser.close();
    } catch (error) {
      console.error(error.message);
    }
    process.exit();
  };

  for (let i = 0; i < playerCount; i++) {
    newPage();
  }
})();
