import { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import * as Joi from 'joi';
export declare class JoiValidationPipe implements PipeTransform {
    private readonly schema;
    constructor(schema: Joi.ObjectSchema);
    transform(value: unknown, _metadata: ArgumentMetadata): unknown;
}
