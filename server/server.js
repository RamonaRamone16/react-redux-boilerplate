import express from 'express'
import path from 'path'
import cors from 'cors'
import sockjs from 'sockjs'
import { renderToStaticNodeStream } from 'react-dom/server'
import React from 'react'

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

function readFromFile(fileName) {
  readFile(fileName, { encoding: "utf8" });
}

function append(fileName, obj) {
  appendFile(fileName, JSON.stringify(obj), { encoding: "utf8" });
}

const middleware = [
  cors(),
  express.static(path.resolve(__dirname, '../dist/assets')),
  express.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }),
  express.json({ limit: '50mb', extended: true }),
  cookieParser()
]

middleware.forEach((it) => server.use(it))

server.use('/api/', (req, res) => {
  res.status(404)
  res.end()
})

server.use((req, res) => {
  res.set('x-skillcrucial-user', 'e1fe1e87-27c8-4c7a-8337-49279f393577');
  res.set('Access-Control-Expose-Headers', 'X-SKILLCRUCIAL-USER');
})

const [htmlStart, htmlEnd] = Html({
  body: 'separator',
  title: 'Skillcrucial'
}).split('separator')

server.get('/api/v1/users', async (req, res) => {
  const result = await axios('https://jsonplaceholder.typicode.com/users').then(({ data }) => data);

  stat(file)
    .then(() =>  write(file, result))
      .catch(() => append(file, result));

  res.json(result);
})

server.post('/api/v1/users', (req, res) => {
  const lastId = JSON.parse(readFromFile(file)).push().id;
  const obj = { ...req.body, id: lastId + 1 }

  write(file, obj);

  res.json({ status: 'success', id: obj.id});
})

server.patch('patch /api/v1/users/:userId', (req, res) => {
  const { id } = req.params;

  const arr = JSON.parse(readFromFile(file));

  write(file, [ ...arr.filter(it => it.id !== id), { ...JSON.parse(req.body), id } ]);
  res.json({  status: 'success', id })
})

server.delete('patch /api/v1/users/:userId', (req, res) => {
  const { id } = req.params;
  
  const arr = JSON.parse(readFromFile(file));

  write(file, [ ...arr.filter(it => it.id !== id)]);

  res.json({ status: 'success', id });
})

server.delete('/api/v1/users', () => {
  unlink(file);
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
