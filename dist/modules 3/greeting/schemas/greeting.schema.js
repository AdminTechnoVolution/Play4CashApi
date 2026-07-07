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
exports.GreetingSchema = exports.Greeting = exports.GreetingText = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let GreetingText = class GreetingText {
    es;
    en;
    fr;
    de;
    it;
    pt;
};
exports.GreetingText = GreetingText;
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GreetingText.prototype, "es", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GreetingText.prototype, "en", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GreetingText.prototype, "fr", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GreetingText.prototype, "de", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GreetingText.prototype, "it", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GreetingText.prototype, "pt", void 0);
exports.GreetingText = GreetingText = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], GreetingText);
let Greeting = class Greeting {
    text;
    active;
};
exports.Greeting = Greeting;
__decorate([
    (0, mongoose_1.Prop)({ type: GreetingText, _id: false, required: true }),
    __metadata("design:type", GreetingText)
], Greeting.prototype, "text", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], Greeting.prototype, "active", void 0);
exports.Greeting = Greeting = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, timestamps: true })
], Greeting);
exports.GreetingSchema = mongoose_1.SchemaFactory.createForClass(Greeting);
//# sourceMappingURL=greeting.schema.js.map