import { Document, Schema as MongooseSchema, Types } from 'mongoose';
export type ChessGameDocument = ChessGame & Document;
export declare class ChessGame {
    room_id: Types.ObjectId;
    player1_id: Types.ObjectId;
    player2_id: Types.ObjectId;
    board: any[][];
    current_player: number;
    castling_rights: any;
    en_passant_target: any;
    history: any[];
    turn_start_time: Date;
}
export declare const ChessGameSchema: MongooseSchema<ChessGame, import("mongoose").Model<ChessGame, any, any, any, any, any, ChessGame>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ChessGame, Document<unknown, {}, ChessGame, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<ChessGame & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    room_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ChessGame, Document<unknown, {}, ChessGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ChessGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    player1_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ChessGame, Document<unknown, {}, ChessGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ChessGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    player2_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ChessGame, Document<unknown, {}, ChessGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ChessGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    board?: import("mongoose").SchemaDefinitionProperty<any[][], ChessGame, Document<unknown, {}, ChessGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ChessGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    current_player?: import("mongoose").SchemaDefinitionProperty<number, ChessGame, Document<unknown, {}, ChessGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ChessGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    castling_rights?: import("mongoose").SchemaDefinitionProperty<any, ChessGame, Document<unknown, {}, ChessGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ChessGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    en_passant_target?: import("mongoose").SchemaDefinitionProperty<any, ChessGame, Document<unknown, {}, ChessGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ChessGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    history?: import("mongoose").SchemaDefinitionProperty<any[], ChessGame, Document<unknown, {}, ChessGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ChessGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    turn_start_time?: import("mongoose").SchemaDefinitionProperty<Date, ChessGame, Document<unknown, {}, ChessGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ChessGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, ChessGame>;
