"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessException = void 0;
const common_1 = require("@nestjs/common");
class BusinessException extends common_1.HttpException {
    statusCode;
    data;
    constructor(messageKey, statusCode = common_1.HttpStatus.BAD_REQUEST, data = null) {
        super(messageKey, statusCode);
        this.statusCode = statusCode;
        this.data = data;
    }
}
exports.BusinessException = BusinessException;
//# sourceMappingURL=business.exception.js.map