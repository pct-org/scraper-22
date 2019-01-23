// Import the necessary modules.
// @flow
import 'dotenv/config'
import { isMaster } from 'cluster'
import { join } from 'path'
import {
  Database,
  HttpServer,
  Logger,
  Routes,
  PopApi
} from 'pop-api'
import {
  Cron,
  PopApiScraper
} from 'pop-api-scraper'

import controllers from './controllers'
import providers from './scraper'
import { Cli } from './middleware'
import {
  name,
  version
} from '../package.json'

/** Setup the api. */
(async() => {
  try {
    providers.map(p => {
      const { Provider, args } = p
      PopApiScraper.use(Provider, args)
    })

    process.env.TEMP_DIR = process.env.TEMP_DIR || join(...[
      __dirname,
      '..',
      'tmp'
    ])
    const logDir = process.env.TEMP_DIR
    await PopApi.init({
      name,
      version,
      logDir,
      controllers,
      statusPath: join(...[logDir, 'status.json']),
      updatedPath: join(...[logDir, 'updated.json'])

      // This starts the scraping on the master node and sets up the cron
      // start: isMaster
    }, [
      Cli,
      Logger,
      Database,
      Routes,
      HttpServer,
      PopApiScraper
    ])

    if (isMaster) {
      // Add the cron and enabled it if the scraper should start
      await PopApi.use(Cron, {
        start: PopApi.startScraper
      })
    }

  } catch (err) {
    throw err
  }
})()
