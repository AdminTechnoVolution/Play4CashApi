import { Document, Schema as MongooseSchema, Types } from 'mongoose';
export type HalmaGameDocument = HalmaGame & Document;
export declare class HalmaGame {
    room_id: Types.ObjectId;
    player1_id: Types.ObjectId;
    player2_id: Types.ObjectId;
    board: number[][];
    current_player: 1 | 2;
    pending_captures: [number, number][];
    must_end_turn: boolean;
    turn_start_time: Date;
}
export declare const HalmaGameSchema: MongooseSchema<HalmaGame, import("mongoose").Model<HalmaGame, any, any, any, any, any, HalmaGame>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, HalmaGame, Document<unknown, {}, HalmaGame, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<HalmaGame & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    room_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, HalmaGame, Document<unknown, {}, HalmaGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<HalmaGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    player1_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, HalmaGame, Document<unknown, {}, HalmaGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<HalmaGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    player2_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, HalmaGame, Document<unknown, {}, HalmaGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<HalmaGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    board?: import("mongoose").SchemaDefinitionProperty<number[][], HalmaGame, Document<unknown, {}, HalmaGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<HalmaGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    current_player?: import("mongoose").SchemaDefinitionProperty<1 | 2, HalmaGame, Document<unknown, {}, HalmaGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<HalmaGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    pending_captures?: import("mongoose").SchemaDefinitionProperty<[number, number][], HalmaGame, Document<unknown, {}, HalmaGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<HalmaGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    must_end_turn?: import("mongoose").SchemaDefinitionProperty<boolean, HalmaGame, Document<unknown, {}, HalmaGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<HalmaGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    turn_start_time?: import("mongoose").SchemaDefinitionProperty<Date, HalmaGame, Document<unknown, {}, HalmaGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<HalmaGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, HalmaGame>;
