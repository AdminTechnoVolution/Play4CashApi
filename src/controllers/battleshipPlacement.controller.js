const { savePlacement: serviceSavePlacement } = require('../services/battleshipPlacement.service');

const savePlacement = async (req, res, next) => {
    try {
        const jsonResponse = await serviceSavePlacement(req);
        res.status(201).json(jsonResponse);
    } catch (err) {
        next(err);
    }
};

module.exports = { savePlacement };
