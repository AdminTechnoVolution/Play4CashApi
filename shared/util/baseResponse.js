/**
 * @swagger
 * components:
 *   schemas:
 *     BaseResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true/false
 *         messages:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Success", "Error"]
 *         data:
 *           type: object
 *           nullable: true
 */
class BaseResponse {
    constructor(success, messages = [], data = null) {
        this.success = success;
        this.messages = messages;
        this.data = data;
    }
}

module.exports = BaseResponse;
