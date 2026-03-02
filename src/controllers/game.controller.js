const {
    getActiveGames: serviceGetActiveGames,
} = require('../services/game.service');

const getActiveGames = async (req, res, next) => {
    try {
        let jsonResponse = await serviceGetActiveGames(req);
        res.status(200).json(jsonResponse);
    } catch (err) {
        next(err);
    }
};

module.exports = { getActiveGames };