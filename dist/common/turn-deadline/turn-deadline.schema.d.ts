import { Document } from 'mongoose';
export type TurnDeadlineDocument = TurnDeadline & Document;
export declare class TurnDeadline {
    game_name: string;
    room_id: string;
    player_id: string;
    expires_at: Date;
    processing: boolean;
}
export declare const TurnDeadlineSchema: import("mongoose").Schema<TurnDeadline, import("mongoose").Model<TurnDeadline, any, any, any, any, any, TurnDeadline>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, TurnDeadline, Document<unknown, {}, TurnDeadline, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<TurnDeadline & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    game_name?: import("mongoose").SchemaDefinitionProperty<string, TurnDeadline, Document<unknown, {}, TurnDeadline, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TurnDeadline & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    room_id?: import("mongoose").SchemaDefinitionProperty<string, TurnDeadline, Document<unknown, {}, TurnDeadline, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TurnDeadline & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    player_id?: import("mongoose").SchemaDefinitionProperty<string, TurnDeadline, Document<unknown, {}, TurnDeadline, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TurnDeadline & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    expires_at?: import("mongoose").SchemaDefinitionProperty<Date, TurnDeadline, Document<unknown, {}, TurnDeadline, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TurnDeadline & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    processing?: import("mongoose").SchemaDefinitionProperty<boolean, TurnDeadline, Document<unknown, {}, TurnDeadline, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TurnDeadline & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, TurnDeadline>;
