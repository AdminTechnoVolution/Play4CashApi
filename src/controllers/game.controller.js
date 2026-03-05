const {
    getActiveGames: serviceGetActiveGames,
    createGame: serviceCreateGame,
    updateGame: serviceUpdateGame,
    deleteGame: serviceDeleteGame,
} = require('../services/game.service');

const getActiveGames = async (req, res, next) => {
    try {
        let jsonResponse = await serviceGetActiveGames(req);
        res.status(200).json(jsonResponse);
    } catch (err) {
        next(err);
    }
};

const createGame = async (req, res, next) => {
    try {
        let jsonResponse = await serviceCreateGame(req);
        res.status(201).json(jsonResponse);
    } catch (err) {
        next(err);
    }
};

const updateGame = async (req, res, next) => {
    try {
        let jsonResponse = await serviceUpdateGame(req);
        res.status(200).json(jsonResponse);
    } catch (err) {
        next(err);
    }
};

const deleteGame = async (req, res, next) => {
    try {
        let jsonResponse = await serviceDeleteGame(req);
        res.status(200).json(jsonResponse);
    } catch (err) {
        next(err);
    }
};

module.exports = { getActiveGames, createGame, updateGame, deleteGame };