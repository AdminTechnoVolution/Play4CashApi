const Joi = require('joi');

const cellSchema = Joi.array()
    .items(Joi.number().integer().min(0).max(9))
    .length(2)
    .required();

const shipSchema = Joi.object({
    type: Joi.string()
        .valid('carrier', 'battleship', 'cruiser', 'submarine', 'destroyer')
        .required()
        .messages({
            'any.required': 'ship.type.required',
            'any.only': 'ship.type.invalid',
        }),
    startRow: Joi.number().integer().min(0).max(9).required()
        .messages({ 'any.required': 'ship.startRow.required', 'number.min': 'ship.startRow.outOfBounds', 'number.max': 'ship.startRow.outOfBounds' }),
    startCol: Joi.number().integer().min(0).max(9).required()
        .messages({ 'any.required': 'ship.startCol.required', 'number.min': 'ship.startCol.outOfBounds', 'number.max': 'ship.startCol.outOfBounds' }),
    isHorizontal: Joi.boolean().required()
        .messages({ 'any.required': 'ship.isHorizontal.required' }),
    cells: Joi.array().items(cellSchema).min(1).required()
        .messages({ 'any.required': 'ship.cells.required', 'array.min': 'ship.cells.empty' }),
});

/**
 * @swagger
 * components:
 *   schemas:
 *     BattleshipPlacementSchema:
 *       type: object
 *       required:
 *         - ships
 *       properties:
 *         ships:
 *           type: array
 *           minItems: 5
 *           maxItems: 5
 *           items:
 *             type: object
 *             required:
 *               - type
 *               - startRow
 *               - startCol
 *               - isHorizontal
 *               - cells
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [carrier, battleship, cruiser, submarine, destroyer]
 *               startRow:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 9
 *               startCol:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 9
 *               isHorizontal:
 *                 type: boolean
 *               cells:
 *                 type: array
 *                 description: Array of [row, col] pairs for each occupied cell
 *                 items:
 *                   type: array
 *                   items:
 *                     type: integer
 *                   minItems: 2
 *                   maxItems: 2
 *                 example: [[0,0],[0,1],[0,2],[0,3],[0,4]]
*/
const battleshipPlacementSchema = Joi.object({
    ships: Joi.array().items(shipSchema).length(5).required()
        .messages({
            'any.required': 'ships.required',
            'array.length': 'ships.exactlyFive',
        }),
});

module.exports = { battleshipPlacementSchema };
