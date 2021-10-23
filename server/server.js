import express from 'express'
import path from 'path'
import cors from 'cors'
import sockjs from 'sockjs'
import { renderToStaticNodeStream } from 'react-dom/server'
import React from 'react'
import axios from 'axios'

import cookieParser from 'cookie-parser'
import config from './config'
import Html from '../client/html'

require('colors')

const { appendFile, readFile, writeFile, stat, unlink } = require("fs").promises;

let Root
try {
  // eslint-disable-next-line import/no-unresolved
  Root = require('../dist/assets/js/ssr/root.bundle').default
} catch {
  console.log('SSR not found. Please run "yarn run build:ssr"'.red)
}

let connections = []

const file = `${__dirname}/text.json`;

const port = process.env.PORT || 8090
const server = express()

function write(fileName, obj) {
  writeFile(fileName, JSON.stringify(obj), { encoding: "utf8" });
} 

async function read(fileName) {
  const data = await readFile(fileName, { encoding: "utf8" });
  return data;
}

const middleware = [
  cors(),
  express.static(path.resolve(__dirname, '../dist/assets')),
  express.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }),
  express.json({ limit: '50mb', extended: true }),
  cookieParser()
]

middleware.forEach((it) => server.use(it))

server.use((req, res, next) => {
  res.set('x-skillcrucial-user', 'e1fe1e87-27c8-4c7a-8337-49279f393577');
  res.set('Access-Control-Expose-Headers', 'X-SKILLCRUCIAL-USER');
  next();
})

const [htmlStart, htmlEnd] = Html({
  body: 'separator',
  title: 'Skillcrucial'
}).split('separator')


server.get('/api/v1/users', async (req, res) => {
  const users = await read(file)
    .then((data) => JSON.parse(data))
    .catch(async () => {
      const result = await axios('https://jsonplaceholder.typicode.com/users')
        .then(({ data }) => data)
        .catch(() => []);
      await appendFile(file, JSON.stringify(result));
      return result;
    });

  res.json(users);
})

server.post('/api/v1/users', async (req, res) => {
  const data = JSON.parse(await read(file));

  const obj = { ...req.body, id: data[data.length - 1].id + 1 }

  await write(file, [...data, obj]);

  res.json({ status: 'success', id: obj.id});
})

server.patch('/api/v1/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const data = JSON.parse(await read(file));

  const arr = [ { ...req.body, id: +userId}, ...data.filter(it => it.id !== +userId) ];

  await write(file, arr.sort((a, b) => a.id - b.id));

  res.json({ status: 'success', id: +userId })
})

server.delete('/api/v1/users/:userId', async (req, res) => {
  const { userId } = req.params;
  
  const data = JSON.parse(await read(file));

  await write(file, [ ...data.filter(it => it.id !== +userId)]);

  res.json({ status: 'success', id: +userId });
})

server.delete('/api/v1/users', (req, res) => {
  stat(file)
    .then(async () => {
      await unlink(file);
      res.json({ status: 'success'})
    })
    .catch(() => res.json({ status: 'fail', message: 'the file isnt exist'}));
})

server.use('/api/', (req, res) => {
  res.status(404)
  res.end()
})

server.get('/', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

server.get('/*', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

const app = server.listen(port)

if (config.isSocketsEnabled) {
  const echo = sockjs.createServer()
  echo.on('connection', (conn) => {
    connections.push(conn)
    conn.on('data', async () => {})

    conn.on('close', () => {
      connections = connections.filter((c) => c.readyState !== 3)
    })
  })
  echo.installHandlers(app, { prefix: '/ws' })
}
console.log(`Serving at http://localhost:${port}`)
