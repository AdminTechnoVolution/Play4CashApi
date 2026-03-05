const path = require('path');
const logger = require('../../shared/config/logger');
const filename = path.basename(__filename);
const Game = require('../models/game.model');
const cache = require('../../shared/cache/cache');
const BaseResponse = require('../../shared/util/baseResponse');
const DataLayerException = require('../../shared/exceptionHandler/DataLayerException');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');
const { CACHE_KEY_GAMES, LANGUAGE_ES, LANGUAGE_EN } = require('../../shared/util/constants');

const getActiveGames = async (req) => {
    try {
        let data = cache.get(CACHE_KEY_GAMES);
        if (!data || (Array.isArray(data) && data.length === 0)) {
            data = await Game.find().select('-created_at').lean();
            cache.set(CACHE_KEY_GAMES, data);
        }

        const newData = await getGameValuesByLanguage(req, data);
        return new BaseResponse(true, [], newData);
    } catch (err) {
        logger.error(`Error getting active games: ${err}`, { className: filename });
        throw new DataLayerException('ERROR_GENERIC_RESPONSE');
    }
}

const createGame = async (req) => {
    try {
        const game = new Game(req.body);
        await game.save();

        cache.del(CACHE_KEY_GAMES);

        return new BaseResponse(true, [], game);
    } catch (err) {
        logger.error(`Error creating game: ${err}`, { className: filename });
        throw new DataLayerException('ERROR_GENERIC_RESPONSE');
    }
}

const updateGame = async (req) => {
    try {
        const { id } = req.params;
        const game = await Game.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: true });

        if (!game) throw new BusinessException('ERROR_NOT_FOUND', 404);

        cache.del(CACHE_KEY_GAMES);

        return new BaseResponse(true, [], game);
    } catch (err) {
        if (err instanceof BusinessException) throw err;
        logger.error(`Error updating game: ${err}`, { className: filename });
        throw new DataLayerException('ERROR_GENERIC_RESPONSE');
    }
}

const deleteGame = async (req) => {
    try {
        const { id } = req.params;
        const game = await Game.findByIdAndDelete(id);

        if (!game) throw new BusinessException('ERROR_NOT_FOUND', 404);

        cache.del(CACHE_KEY_GAMES);

        return new BaseResponse(true, []);
    } catch (err) {
        if (err instanceof BusinessException) throw err;
        logger.error(`Error deleting game: ${err}`, { className: filename });
        throw new DataLayerException('ERROR_GENERIC_RESPONSE');
    }
}

const getGameValuesByLanguage = async (req, data) => {
    const language = req.headers['accept-language'] || LANGUAGE_EN;

    return data.map(item => {
        const newItem = { ...item };
        if (language === LANGUAGE_ES) {
            newItem.name = newItem.name.es;
            newItem.description = newItem.description.es;
        } else {
            newItem.name = newItem.name.en;
            newItem.description = newItem.description.en;
        }
        return newItem;
    });
}

module.exports = { getActiveGames, createGame, updateGame, deleteGame };
