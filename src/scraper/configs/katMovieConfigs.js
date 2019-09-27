// @flow
import { MovieProvider } from '../providers'
import { kat } from '../apiModules'
import { MovieHelper } from '../helpers'

import { MovieModel } from '@pct-org/mongo-models/dist/movie/movie.model'

const regexps = [
  {
    regex: /(.*).(\d{4}).[3Dd]\D+(\d{3,4}p)/i,
  }, {
    regex: /(.*).(\d{4}).[4k]\D+(\d{3,4}p)/i,
  }, {
    regex: /(.*).(\d{4}).[UHD]\D+(\d{3,4}p)/i,
  }, {
    regex: /(.*).(\d{4})\D+(\d{3,4}p)/i,
  },
]

/**
 * The configuration for KAT movies.
 * @type {Object}
 */
export const basekatMovieConfig: Object = {
  name: 'KAT',
  api: kat,
  contentType: MovieProvider.ContentTypes.Movie,
  Helper: MovieHelper,
  Model: MovieModel,
  regexps,
}

/**
 * Export the configs for the MovieProvider.
 * @type {Array<Object>}
 */
export default [
  // Disabled for now to prevent non eng content
  // {
  //   ...basekatMovieConfig,
  //   query: {
  //     page: 1,
  //     language: 'english',
  //     verified: 1,
  //     category: 'movies',
  //     subcate: 'hd',
  //   },
  // },

  // Only use cat for UltraHD
  {
    ...basekatMovieConfig,
    query: {
      page: 1,
      language: 'english',
      verified: 1,
      category: 'movies',
      subcate: 'ultrahd',
    },
  },
]