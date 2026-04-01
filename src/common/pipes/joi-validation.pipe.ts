import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import * as Joi from 'joi';

/**
 * Pipe that validates request data against a Joi schema.
 * Preserves the existing Joi validator files from the Express app.
 *
 * Usage in controller:
 *   @Body(new JoiValidationPipe(myJoiSchema)) body: MyDto
 */
@Injectable()
export class JoiValidationPipe implements PipeTransform {
  constructor(private readonly schema: Joi.ObjectSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const { error, value: validated } = this.schema.validate(value, {
      abortEarly: false,
      allowUnknown: false,
    });

    if (error) {
      throw new BadRequestException(
        error.details.map((d) => d.message),
      );
    }

    return validated;
  }
}
