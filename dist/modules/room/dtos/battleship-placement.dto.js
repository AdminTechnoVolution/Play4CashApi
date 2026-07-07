"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BattleshipPlacementDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
class ShipDto {
    type;
    startRow;
    startCol;
    isHorizontal;
    cells;
}
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Type of ship (carrier, battleship, cruiser, submarine, destroyer)' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ShipDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Start row (0-9)' }),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], ShipDto.prototype, "startRow", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Start column (0-9)' }),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], ShipDto.prototype, "startCol", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Is ship horizontal' }),
    __metadata("design:type", Boolean)
], ShipDto.prototype, "isHorizontal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Array of coordinates [row, col]', type: 'array', items: { type: 'array', items: { type: 'number' } } }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsArray)({ each: true }),
    __metadata("design:type", Array)
], ShipDto.prototype, "cells", void 0);
class BattleshipPlacementDto {
    ships;
}
exports.BattleshipPlacementDto = BattleshipPlacementDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ShipDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ShipDto),
    __metadata("design:type", Array)
], BattleshipPlacementDto.prototype, "ships", void 0);
//# sourceMappingURL=battleship-placement.dto.js.map