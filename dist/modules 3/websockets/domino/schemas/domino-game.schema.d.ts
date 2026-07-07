import { Document, Schema as MongooseSchema, Types } from 'mongoose';
export type DominoGameDocument = DominoGame & Document;
declare class OpenEnds {
    left: number;
    right: number;
}
export declare class DominoGame {
    room_id: Types.ObjectId;
    player_ids: Types.ObjectId[];
    hands: Map<string, number[][]>;
    board: number[][];
    boneyard: number[][];
    current_player_index: number;
    open_ends: OpenEnds;
    turn_start_time: Date;
    status: string;
    consecutive_passes: number;
    eliminated_players: string[];
}
export declare const DominoGameSchema: MongooseSchema<DominoGame, import("mongoose").Model<DominoGame, any, any, any, any, any, DominoGame>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, DominoGame, Document<unknown, {}, DominoGame, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<DominoGame & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    room_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, DominoGame, Document<unknown, {}, DominoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DominoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    player_ids?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId[], DominoGame, Document<unknown, {}, DominoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DominoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    hands?: import("mongoose").SchemaDefinitionProperty<Map<string, number[][]>, DominoGame, Document<unknown, {}, DominoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DominoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    board?: import("mongoose").SchemaDefinitionProperty<number[][], DominoGame, Document<unknown, {}, DominoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DominoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    boneyard?: import("mongoose").SchemaDefinitionProperty<number[][], DominoGame, Document<unknown, {}, DominoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DominoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    current_player_index?: import("mongoose").SchemaDefinitionProperty<number, DominoGame, Document<unknown, {}, DominoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DominoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    open_ends?: import("mongoose").SchemaDefinitionProperty<OpenEnds, DominoGame, Document<unknown, {}, DominoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DominoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    turn_start_time?: import("mongoose").SchemaDefinitionProperty<Date, DominoGame, Document<unknown, {}, DominoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DominoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, DominoGame, Document<unknown, {}, DominoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DominoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    consecutive_passes?: import("mongoose").SchemaDefinitionProperty<number, DominoGame, Document<unknown, {}, DominoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DominoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    eliminated_players?: import("mongoose").SchemaDefinitionProperty<string[], DominoGame, Document<unknown, {}, DominoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DominoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, DominoGame>;
export {};
