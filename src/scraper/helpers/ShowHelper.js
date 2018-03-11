// Import the necessary modules.
// @flow
/* eslint-disable camelcase */
import pMap from 'p-map'

import AbstractHelper from './AbstractHelper'
import {
  fanart,
  tmdb,
  trakt
} from '../apiModules'
import type {
  AnimeShow,
  Show
} from '../../models'

/**
 * Class for saving shows.
 * @extends {AbstractHelper}
 * @type {ShowHelper}
 */
export default class ShowHelper extends AbstractHelper {

  /**
   * Update the number of seasons of a given show.
   * @param {!AnimeShow|Show} show - The show to update the number of seasons.
   * @returns {Promise<AnimeShow|Show>} - A newly updated show.
   */
  async _updateNumSeasons(show: AnimeShow | Show): Promise<AnimeShow | Show> {
    const saved = await this.Model.findOneAndUpdate({
      _id: show.imdb_id
    }, new this.Model(show), {
      new: true,
      upsert: true
    })

    const distinct = await this.Model.distinct('episodes.season', {
      _id: saved.imdb_id
    }).exec()
    saved.num_seasons = distinct.length

    return this.Model.findOneAndUpdate({
      _id: saved.imdb_id
    }, new this.Model(saved), {
      new: true,
      upsert: true
    })
  }

  /**
   * Update the torrents for an existing show.
   * @param {!Object} matching - The matching episode of new the show.
   * @param {!Object} found - The matching episode existing show.
   * @param {!AnimeShow|Show} show - The show to merge the episodes to.
   * @param {!string} quality - The quality of the torrent.
   * @returns {AnimeShow|Show} - A show with merged torrents.
   */
  _updateEpisode(
    matching: Object,
    found: Object,
    show: AnimeShow | Show,
    quality: string
  ): AnimeShow | Show {
    const index = show.episodes.indexOf(matching)

    const foundTorrents = found.torrents[quality]
    let matchingTorrents = matching.torrents[quality]

    if (foundTorrents && matchingTorrents) {
      let update = false

      if (
        foundTorrents.seeds > matchingTorrents.seeds ||
        foundTorrents.url === matchingTorrents.url
      ) {
        update = true
      }

      if (update) {
        matchingTorrents = foundTorrents
      }
    } else if (foundTorrents && !matchingTorrents) {
      matchingTorrents = foundTorrents
    }

    show.episodes.splice(index, 1, matching)
    return show
  }

  /**
   * Update a given show with its associated episodes.
   * @param {!AnimeShow|Show} show - The show to update its episodes.
   * @returns {Promise<AnimeShow|Show>} - A newly updated show.
   */
  async _updateEpisodes(show: AnimeShow | Show): Promise<AnimeShow | Show> {
    try {
      let s = show
      const found = await this.Model.findOne({
        _id: s.imdb_id
      })
      if (!found) {
        logger.info(`${this.name}: '${s.title}' is a new show!`)
        const newShow = await new this.Model(s).save()
        return await this._updateNumSeasons(newShow)
      }

      logger.info(`${this.name}: '${found.title}' is an existing show.`)

      found.episodes.map(e => {
        const matching = s.episodes.find(
          s => s.season === e.season && s.episode === e.episode
        )

        if (e.first_aired > s.latest_episode) {
          s.latest_episode = e.first_aired
        }

        if (!matching) {
          return s.episodes.push(e)
        }

        s = this._updateEpisode(matching, e, s, '480p')
        s = this._updateEpisode(matching, e, s, '720p')
        s = this._updateEpisode(matching, e, s, '1080p')
      })

      return await this._updateNumSeasons(s)
    } catch (err) {
      logger.error(err)
    }
  }

  /**
   * Adds one season to a show.
   * @param {!AnimeShow|Show} show - The show to add the torrents to.
   * @param {!Object} episodes - The episodes containing the torrents.
   * @param {!number} season - The season number.
   * @returns {Promise<AnimeShow | Show>} - A newly updated show.
   */
  _addSeason(
    show: AnimeShow | Show,
    episodes: Object,
    season: number
  ): Promise<AnimeShow | Show> {
    return tmdb.seasons.season({
      id: show.tmdb_id,
      season
    }).then(s => {
      const updatedEpisodes = []

      const baseUrl = 'https://image.tmdb.org/t/p'

      s.episodes.map(e => {
        const episode = {
          tmdb_id: parseInt(e.id, 10),
          number: parseInt(e.episode_number, 10),
          title: e.title,
          synopsis: e.overview,
          first_aired: new Date(e.air_date).getTime() / 1000.0,
          image: e.still_path ? `${baseUrl}/w300/${e.still_path}` : null,
          torrents: episodes[season][e.episode_number]
        }

        updatedEpisodes.push(episode)
      })

      const season = {
        tmdb_id: s.id,
        number: s.season_number,
        title: s.name,
        synopsis: s.overview,
        first_aired: new Date(s.air_date).getTime() / 1000.0,
        image: s.poster_path ? `${baseUrl}/w500/${s.poster_path}` : null,
        episodes: updatedEpisodes
      }

      show.seasons.push(season)
      return show
    }).catch(err =>
      logger.error(`Trakt: Could not find any data on: ${err.path || err}`)
    )
  }

  /**
   * Adds episodes to a show.
   * @param {!AnimeShow|Show} show - The show to add the torrents to.
   * @param {!Object} episodes - The episodes containing the torrents.
   * @returns {Show} - A show with updated torrents.
   */
  addEpisodes(
    show: AnimeShow | Show,
    episodes: Object
  ): Show {
    return pMap(Object.keys(episodes), season => {
      return this._addSeason(show, episodes, season)
    }).then(() => this._updateEpisodes(show))
      .catch(err => logger.error(err))
  }

  /**
   * Get TV show images from TMDB.
   * @param {!number} tmdbId - The tmdb id of the show for which you want the
   * images.
   * @returns {Promise<Object>} - Object with backdrop and poster images.
   */
  _getTmdbImages(tmdbId: number): Promise<Object> {
    return tmdb.tv.images({
      tv_id: tmdbId
    }).then(i => {
      const baseUrl = 'http://image.tmdb.org/t/p/w'

      const poster = i.posters.filter(
        poster => poster.iso_639_1 === 'en' || poster.iso_639_1 === null
      )[0]
      const posterPath = poster.file_path
      const posterWidth = poster.width

      const backdrop = i.backdrops.filter(
        backdrop => backdrop.iso_639_1 === 'en' || backdrop.iso_639_1 === null
      )[0]
      const backdropPath = backdrop.file_path
      const backdropWidth = backdrop.width

      return {
        backdrop: backdrop ? `${baseUrl}${backdropWidth}${backdropPath}` : null,
        poster: poster ? `${baseUrl}${posterWidth}${posterPath}` : null
      }
    })
  }

  /**
   * Get TV show images from Fanart.
   * @param {!number} tvdbId - The tvdb id of the show for which to fetch
   * images.
   * @returns {Promise<Object>} - Object with backdrop and poster images.
   */
  _getFanartImages(tvdbId: number): Promise<Object> {
    return fanart.getShowImages(tvdbId).then(i => {
      return {
        backdrop: i.showbackground[0].url,
        poster: i.tvposter[0].url,
        logo: i.hdtvlogo[0].url,
        thumb: i.tvthumb[0].url
      }
    })
  }

  /**
   * Get TV show images.
   * @override
   * @protected
   * @param {!number} tmdbId - The tmdb id of the show for which to fetch
   * images.
   * @param {!number} tvdbId - The tvdb id of the show for which you to fetch
   * images.
   * @returns {Promise<Object>} - Object with backdrop, poster, logo and thumb
   * images.
   */
  async getImages({ tmdbId, tvdbId }: Object): Promise<Object> {
    const tmdbImages = await this._getTmdbImages(tmdbId)
    const images = await this._getFanartImages(tvdbId)

    if (tmdbImages.backdrop !== null) {
      images.backdrop = tmdbImages.backdrop // TMDB ones are better
    }

    if (tmdbImages.poster !== null) {
      images.poster = tmdbImages.poster // TMDB ones are better
    }

    return images
  }

  /**
   * Get info from Trakt and make a new show object.
   * @override
   * @param {!string} slug - The slug to query https://trakt.tv/.
   * @returns {Promise<AnimeShow | Show | Error>} - A new show without the
   * episodes attached.
   */
  async getTraktInfo(slug: string): Promise<AnimeShow | Show | Error> {
    try {
      const traktShow = await trakt.shows.summary({
        slug,
        extended: 'full'
      })
      const traktWatchers = await trakt.shows.watching({
        id: slug
      })

      const { imdb, tmdb, tvdb } = traktShow.ids

      if (traktShow && imdb && tmdb && tvdb) {
        return Promise.resolve(
          {
            imdb_id: imdb,
            tmdb_id: tmdb,
            title: traktShow.title,
            released: new Date(traktShow.released).getTime() / 1000.0,
            certification: traktShow.certification,
            slug: traktShow.ids.slug,
            synopsis: traktShow.overview,
            runtime: traktShow.runtime,
            rating: {
              votes: traktShow.votes,
              watching: traktWatchers ? traktWatchers.length : 0,
              percentage: Math.round(traktShow.rating * 10)
            },
            images: await this.getImages({
              tmdbId: tmdb,
              tvdbId: tvdb
            }),
            genres: traktShow.genres ? traktShow.genres : ['unknown'],
            tvdb_id: tvdb,
            air_info: {
              network: traktShow.network,
              country: traktShow.country,
              day: traktShow.airs.day,
              time: traktShow.airs.time,
              status: traktShow.status
            },
            last_updated: Number(new Date()),
            seasons: []
          }
        )
      }
    } catch (err) {
      logger.error(`Trakt: Could not find any data on: ${err.path || err}`)
      return Promise.reject(err)
    }
  }

}
