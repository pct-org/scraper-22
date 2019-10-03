// @flow
import type { Movie } from '@pct-org/mongo-models'

import AbstractHelper from './AbstractHelper'
import { fanart, tmdb, trakt, omdb } from '../apiModules'

/**
 * Class for saving movies.
 * @extends {AbstractHelper}
 * @type {MovieHelper}
 */
export default class MovieHelper extends AbstractHelper {

  /**
   * Update a given movie.
   * @param {!Movie} movie - The movie to update its torrent.
   * @returns {Movie} - A newly updated movie.
   */
  async _updateMovieInDb(movie: Movie): Movie {
    try {
      const m = movie
      const found = await this.Model.findOne({
        _id: m._id,
      })

      if (found) {
        logger.info(`${this.name}: '${found.title}' is an existing movie.`)

        if (found.torrents) {
          m.torrents = this._formatTorrents(m.torrents, found.torrents)
        }

        // Keep old attributes that could change
        m.createdAt = found.createdAt
        m.bookmarked = found.bookmarked
        m.bookmarkedOn = found.bookmarkedOn
        m.watched = found.watched
        m.downloaded = found.downloaded
        m.downloading = found.downloading
        m.downloadedOn = found.downloadedOn

        return await this.Model.findOneAndUpdate({
            _id: m._id,
          },
          m,
          {
            upsert: true,
            new: true,
          },
        )
      }

      logger.info(`${this.name}: '${m.title}' is a new movie!`)

      return await new this.Model(m).save()

    } catch (err) {
      logger.error(`_updateMovieInDb: ${err.message || err}`)
    }
  }

  /**
   * Adds torrents to a movie.
   * @param {!Movie} movie - The movie to add the torrents to.
   * @param {!Object} torrents - The torrents to add to the movie.
   * @returns {Promise<AnimeMovie|Movie>} - A movie with torrents attached.
   */
  addTorrents(movie: Movie, torrents: Object): Promise<Movie> {
    movie.torrents = this._formatTorrents(torrents)

    return this._updateMovieInDb(movie)
  }

  /**
   * Get movie images from TMDB.
   * @param {!Movie} movie - The movie you want the images for
   * @returns {Promise<Movie>} - A movie with torrents attached.
   */
  _addTmdbImages(movie: Movie): Promise<Movie> {
    return tmdb.movie.images({
      movie_id: movie.tmdbId,
    }).then(i => {
      const tmdbPoster = i.posters.filter(
        poster => poster.iso_639_1 === 'en' || poster.iso_639_1 === null,
      ).shift()

      const tmdbBackdrop = i.backdrops.filter(
        backdrop => backdrop.iso_639_1 === 'en' || backdrop.iso_639_1 === null,
      ).shift()

      return this.checkImages({
        ...movie,
        images: {
          banner: AbstractHelper.DefaultImageSizes,

          backdrop: tmdbBackdrop
            ? this._formatImdbImage(tmdbBackdrop.file_path)
            : AbstractHelper.DefaultImageSizes,

          poster: tmdbPoster
            ? this._formatImdbImage(tmdbPoster.file_path)
            : AbstractHelper.DefaultImageSizes,

          logo: AbstractHelper.DefaultImageSizes,
        },
      })

    }).catch(err => {
      // If we have tmdb_id then the check images failed
      if (err.tmdbId) {
        return Promise.reject(err)

      } else if (err.statusCode && err.statusCode === 404) {
        logger.warn(`_addTmdbImages: can't find images for slug '${movie.slug}'`)

      } else {
        logger.error(`_addTmdbImages: ${err.message || err}`)
      }

      // Always return the movie
      return Promise.reject(movie)
    })
  }

  /**
   * Get movie images from OMDB.
   * @param {!Movie} movie - The movie you want the images for
   * @returns {Promise<Movie>} - A movie with torrents attached.
   */
  _addOmdbImages(movie: Movie): Promise<Movie> {
    // TODO:: Check if rate limit is hit, if so then skip this one

    // Check if we already have the images omdb can retrieve if so throw catch
    if (movie.images.poster) {
      return Promise.reject(movie)
    }

    return omdb.byId({
      imdb: movie.imdbId,
      type: 'movie',
    }).then(i => {
      return this.checkImages({
        ...movie,
        images: {
          banner: movie.images.banner,

          backdrop: movie.images.backdrop,

          poster: !movie.images.poster && i.Poster
            ? {
              full: i.Poster,
              high: i.Poster,
              medium: i.Poster,
              thumb: i.Poster,
            }
            : movie.images.poster,

          logo: movie.images.logo,
        },
      })

    }).catch(err => {
      // If we have imdb_id then the check images failed
      if (err.imdbId) {
        return Promise.reject(err)

      } else if (err.statusCode && err.statusCode === 404) {
        logger.warn(`_addOmdbImages: can't find images for slug '${movie.slug}'`)

      } else if (err.statusCode && err.statusCode === 401) {
        logger.warn(`_addOmdbImages: rate limit hit`)

      } else {
        logger.error(`_addOmdbImages: ${err.message || err}`)
      }

      // Always return the movie
      return Promise.reject(movie)
    })
  }

  /**
   * Get movie images from Fanart.
   * @param {!Movie} movie - The movie you want the images for
   * @returns {Promise<Movie>} - A movie with torrents attached.
   */
  _addFanartImages(movie: Movie): Promise<Movie> {
    return fanart.getMovieImages(movie.tmdbId).then(i => {
      const banner = !movie.images.banner && i.moviebanner
        ? i.moviebanner.shift()
        : null

      const backdrop = !movie.images.backdrop && i.moviebackground
        ? i.moviebackground.shift()
        : !movie.images.backdrop && i.hdmovieclearart
          ? i.hdmovieclearart.shift()
          : null

      const poster = !movie.images.poster && i.movieposter
        ? i.movieposter.shift()
        : null

      const logo = !movie.images.logo && i.movielogo
        ? i.movielogo.shift()
        : !movie.images.logo && i.hdmovielogo
          ? i.hdmovielogo.shift()
          : null

      return this.checkImages({
        ...movie,
        images: {
          banner: banner
            ? {
              full: banner.url,
              high: banner.url,
              medium: banner.url,
              thumb: banner.url,
            }
            : movie.images.banner,

          backdrop: backdrop ? {
              full: backdrop.url,
              high: backdrop.url,
              medium: backdrop.url,
              thumb: backdrop.url,
            }
            : movie.images.backdrop,

          poster: poster ? {
              full: poster.url,
              high: poster.url,
              medium: poster.url,
              thumb: poster.url,
            }
            : movie.images.poster,

          logo: logo ? {
              full: logo.url,
              high: logo.url,
              medium: logo.url,
              thumb: logo.url,
            }
            : movie.images.logo,
        },
      })

    }).catch(err => {
      // If we have tmdb_id then the check images failed
      if (err.tmdbId) {
        return Promise.reject(err)

      } else if (err.statusCode && err.statusCode === 404) {
        // There is almost never images from Fanart
        // logger.warn(`_addFanartImages: can't find images for slug '${movie.slug}'`)

      } else {
        logger.error(`_addFanartImages: ${err.message || err}`)
      }

      // Always return the movie
      return Promise.reject(movie)
    })
  }

  /**
   * Add images to item
   * @protected
   * @param {!Movie} movie - The item to fetch images for
   * @returns {Promise<Object>} - Object with banner, fanart and poster images.
   */
  addImages(movie: Movie): Promise<Object> {
    return this._addTmdbImages(movie)
      .catch(movie => this._addOmdbImages(movie))
      .catch(movie => this._addFanartImages(movie))
      .catch(movie => movie)
  }

  /**
   * Get info from Trakt and make a new movie object.
   * @override
   * @param {!string} traktSlug - The slug to query trakt.tv.
   * @returns {Promise<Movie | Error>} - A new movie.
   */
  async getTraktInfo(traktSlug: string): Promise<Movie | Error> {
    try {
      const traktMovie = await trakt.movies.summary({
        id: traktSlug,
        extended: 'full',
      })

      const traktWatchers = await trakt.movies.watching({
        id: traktSlug,
      })

      if (traktMovie && traktMovie.ids.imdb && traktMovie.ids.tmdb) {
        const ratingPercentage = Math.round(traktMovie.rating * 10)

        return this.addImages({
          _id: traktMovie.ids.imdb,
          imdbId: traktMovie.ids.imdb,
          tmdbId: traktMovie.ids.tmdb,
          slug: traktMovie.ids.slug,
          title: traktMovie.title,
          released: new Date(traktMovie.released).getTime(),
          certification: traktMovie.certification,
          synopsis: traktMovie.overview,
          runtime: this._formatRuntime(traktMovie.runtime),
          rating: {
            stars: parseFloat(((ratingPercentage / 100) * 5).toFixed('2')),
            votes: traktMovie.votes,
            watching: await traktWatchers ? traktWatchers.length : 0,
            percentage: ratingPercentage,
          },
          images: {
            banner: AbstractHelper.DefaultImageSizes,
            backdrop: AbstractHelper.DefaultImageSizes,
            poster: AbstractHelper.DefaultImageSizes,
          },
          genres: traktMovie.genres ? traktMovie.genres : ['unknown'],
          trailer: traktMovie.trailer,
          createdAt: Number(new Date()),
          updatedAt: Number(new Date()),
          type: 'movie',
          torrents: [],
          watched: {
            complete: false,
            progress: 0,
          },
          bookmarked: false,
          bookmarkedOn: null,
        })
      }
    } catch (err) {
      let message = `getTraktInfo: ${err.path || err}`

      if (err.statusCode === 404) {
        message = `getTraktInfo: Could not find any data with slug: '${traktSlug}'`
      }

      // BaseProvider will log it
      return Promise.reject(Error(message))
    }
  }

}
