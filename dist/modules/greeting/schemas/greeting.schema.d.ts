import { Document } from 'mongoose';
export type GreetingDocument = Greeting & Document;
export declare class GreetingText {
    es: string;
    en: string;
    fr: string;
    de: string;
    it: string;
    pt: string;
}
export declare class Greeting {
    text: GreetingText;
    active: boolean;
}
export declare const GreetingSchema: import("mongoose").Schema<Greeting, import("mongoose").Model<Greeting, any, any, any, any, any, Greeting>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Greeting, Document<unknown, {}, Greeting, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Greeting & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    text?: import("mongoose").SchemaDefinitionProperty<GreetingText, Greeting, Document<unknown, {}, Greeting, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Greeting & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    active?: import("mongoose").SchemaDefinitionProperty<boolean, Greeting, Document<unknown, {}, Greeting, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Greeting & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Greeting>;
