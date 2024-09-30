import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import {HTTPException} from "hono/http-exception";
import * as crypto from "crypto";
import * as fs from "fs";
import nodeHtmlToImage from 'node-html-to-image';
const PNG = require('pngjs').PNG;
import pixelmatch from 'pixelmatch';
import { cors } from 'hono/cors';

const app = new Hono()

app.use('/*',cors());

type User = {
  uuid: string;
  name: string;
  isAdmin: boolean;
};

let users: Record<string, User> = {};

async function loadPersistent() {
  try {
    users = JSON.parse((await fs.promises.readFile('data/users.json')).toString());
  } catch (e) {
    users = {};
  }
}

const makeProxy = (target: Record<string, unknown>) => new Proxy(target, {
  set(target, prop, value) {
    target[prop as string] = value;
    fs.promises.writeFile('data/users.json', JSON.stringify(target)).catch(console.log);

    return true;
  },
})

app.get('/users', (c) => {
  const queryValue = c.req.query('admin') ? Boolean(Number(c.req.query('admin'))) : undefined;
  if (queryValue) {
    return c.json(
      Object.values(users)
        .filter((user) => user.isAdmin === queryValue)
      );
  }

  return c.json(Object.values(users));
})

app.get('/users/:uuid', (c) => {
  const uuid = c.req.param('uuid');
  if (users[uuid]) {
    return c.json(users[uuid]);
  }

  throw new HTTPException(404);
})

app.post('/users/create', async (c) => {
  const uuid = crypto.randomUUID();

  const user = {
    uuid,
    name: (await c.req.json()).name,
    isAdmin: false
  };

  users[uuid] = user;

  return c.json(user);
});

app.post('/image/check', async (c) => {
  const data = (await c.req.json()).html;

  const checkPath = './check_image.png';

  await nodeHtmlToImage({
    output: checkPath,
    html: `<html>
    <head>
      <style>
        body {
          width: 400px;
          height: 400px;
        }
      </style>
    </head>
    <body><div>${data}</div></body>
  </html>`
  });


  const img1 = PNG.sync.read(fs.readFileSync(checkPath));
  const img2 = PNG.sync.read(fs.readFileSync('./image.png'));
  const {width, height} = img1;
  const diff = new PNG({width, height});

  const difference = pixelmatch(img1.data, img2.data, diff.data, width, height, {threshold: 0.1});

  console.log(difference);

  const compatibility = 100 - difference * 100 / (width * height);

  return c.json({
    percent: compatibility,
  })
})

const port = 3000

loadPersistent().then(() => {
  users = makeProxy(users) as Record<string, User>;
  console.log(`Server is running on port ${port}`)
  serve({
    fetch: app.fetch,
    port
  })
});

