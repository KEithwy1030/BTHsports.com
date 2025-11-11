const axios = require('axios');
const cheerio = require('cheerio');

async function debugStream(streamId = '802974') {
  const basePlay = `http://play.jgdhds.com/play/steam${streamId}.html`;
  console.log('Play page:', basePlay);

  const res1 = await axios.get(basePlay);
  const $1 = cheerio.load(res1.data);
  const channels = [];
  $1('.sub_channel a').each((index, el) => {
    channels.push({
      text: $1(el).text().trim(),
      dataPlay: $1(el).attr('data-play'),
      href: $1(el).attr('href')
    });
  });
  console.log('sub_channel buttons:', channels);

  const iframe1 = $1('iframe').first().attr('src');
  console.log('iframe1:', iframe1);
  const smUrl = new URL(iframe1, basePlay).toString();

  const res2 = await axios.get(smUrl);
  const $2 = cheerio.load(res2.data);
  const iframe2 = $2('iframe').first().attr('src');
  console.log('iframe2:', iframe2);
  const idUrl = new URL(iframe2, smUrl).toString();

  const res3 = await axios.get(idUrl);
  const $3 = cheerio.load(res3.data);
  const iframe3 = $3('iframe').first().attr('src');
  console.log('iframe3:', iframe3);

  const html3 = res3.data;
  console.log('third page snippet:', html3.slice(0, 200));

  const m3u8Match = html3.match(/(https?:\/\/[^'"]+\.m3u8[^'"]*)/i);
  console.log('m3u8Match:', m3u8Match && m3u8Match[1]);

  const scriptMatch = html3.match(/get\('(.*?\.php[^']*)'\)/);
  console.log('scriptMatch:', scriptMatch && scriptMatch[1]);
}

debugStream(process.argv[2]).catch((err) => {
  console.error(err);
});

