import { Document } from 'mongoose';
export type GracePeriodDocument = GracePeriod & Document;
export declare class GracePeriod {
    game_name: string;
    player_id: string;
    room_id: string;
    expires_at: Date;
    processing: boolean;
}
export declare const GracePeriodSchema: import("mongoose").Schema<GracePeriod, import("mongoose").Model<GracePeriod, any, any, any, any, any, GracePeriod>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, GracePeriod, Document<unknown, {}, GracePeriod, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<GracePeriod & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    game_name?: import("mongoose").SchemaDefinitionProperty<string, GracePeriod, Document<unknown, {}, GracePeriod, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GracePeriod & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    player_id?: import("mongoose").SchemaDefinitionProperty<string, GracePeriod, Document<unknown, {}, GracePeriod, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GracePeriod & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    room_id?: import("mongoose").SchemaDefinitionProperty<string, GracePeriod, Document<unknown, {}, GracePeriod, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GracePeriod & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    expires_at?: import("mongoose").SchemaDefinitionProperty<Date, GracePeriod, Document<unknown, {}, GracePeriod, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GracePeriod & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    processing?: import("mongoose").SchemaDefinitionProperty<boolean, GracePeriod, Document<unknown, {}, GracePeriod, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<GracePeriod & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, GracePeriod>;
