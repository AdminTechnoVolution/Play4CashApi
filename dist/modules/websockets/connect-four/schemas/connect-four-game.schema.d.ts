import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import type { ConnectFourBoard } from '../connect-four-game.logic';
export type ConnectFourGameDocument = ConnectFourGame & Document;
export declare class ConnectFourGame {
    room_id: Types.ObjectId;
    player1_id: Types.ObjectId;
    player2_id: Types.ObjectId;
    board: ConnectFourBoard;
    current_player: number;
    winning_cells: Array<{
        row: number;
        col: number;
    }>;
    turn_start_time: Date;
    last_move?: {
        userId: string;
        row: number;
        col: number;
        color: 'R' | 'Y';
        at: Date;
    };
    move_revision: number;
}
export declare const ConnectFourGameSchema: MongooseSchema<ConnectFourGame, import("mongoose").Model<ConnectFourGame, any, any, any, any, any, ConnectFourGame>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ConnectFourGame, Document<unknown, {}, ConnectFourGame, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<ConnectFourGame & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    room_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ConnectFourGame, Document<unknown, {}, ConnectFourGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ConnectFourGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    player1_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ConnectFourGame, Document<unknown, {}, ConnectFourGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ConnectFourGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    player2_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ConnectFourGame, Document<unknown, {}, ConnectFourGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ConnectFourGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    board?: import("mongoose").SchemaDefinitionProperty<ConnectFourBoard, ConnectFourGame, Document<unknown, {}, ConnectFourGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ConnectFourGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    current_player?: import("mongoose").SchemaDefinitionProperty<number, ConnectFourGame, Document<unknown, {}, ConnectFourGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ConnectFourGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    winning_cells?: import("mongoose").SchemaDefinitionProperty<{
        row: number;
        col: number;
    }[], ConnectFourGame, Document<unknown, {}, ConnectFourGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ConnectFourGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    turn_start_time?: import("mongoose").SchemaDefinitionProperty<Date, ConnectFourGame, Document<unknown, {}, ConnectFourGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ConnectFourGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    last_move?: import("mongoose").SchemaDefinitionProperty<{
        userId: string;
        row: number;
        col: number;
        color: "R" | "Y";
        at: Date;
    } | undefined, ConnectFourGame, Document<unknown, {}, ConnectFourGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ConnectFourGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    move_revision?: import("mongoose").SchemaDefinitionProperty<number, ConnectFourGame, Document<unknown, {}, ConnectFourGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ConnectFourGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, ConnectFourGame>;
