import { Document, Schema as MongooseSchema, Types } from 'mongoose';
export type BattleshipPlacementDocument = BattleshipPlacement & Document;
export declare class Ship {
    type: string;
    startRow: number;
    startCol: number;
    isHorizontal: boolean;
    cells: number[][];
}
export declare const ShipSchema: MongooseSchema<Ship, import("mongoose").Model<Ship, any, any, any, any, any, Ship>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Ship, Document<unknown, {}, Ship, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Ship & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    type?: import("mongoose").SchemaDefinitionProperty<string, Ship, Document<unknown, {}, Ship, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Ship & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    startRow?: import("mongoose").SchemaDefinitionProperty<number, Ship, Document<unknown, {}, Ship, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Ship & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    startCol?: import("mongoose").SchemaDefinitionProperty<number, Ship, Document<unknown, {}, Ship, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Ship & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    isHorizontal?: import("mongoose").SchemaDefinitionProperty<boolean, Ship, Document<unknown, {}, Ship, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Ship & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    cells?: import("mongoose").SchemaDefinitionProperty<number[][], Ship, Document<unknown, {}, Ship, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Ship & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Ship>;
export declare class BattleshipPlacement {
    room_id: Types.ObjectId;
    player_id: Types.ObjectId;
    ships: Ship[];
    shotsFired: number[][];
    ready_at: Date;
    status: string;
}
export declare const BattleshipPlacementSchema: MongooseSchema<BattleshipPlacement, import("mongoose").Model<BattleshipPlacement, any, any, any, any, any, BattleshipPlacement>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, BattleshipPlacement, Document<unknown, {}, BattleshipPlacement, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<BattleshipPlacement & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    room_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, BattleshipPlacement, Document<unknown, {}, BattleshipPlacement, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<BattleshipPlacement & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    player_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, BattleshipPlacement, Document<unknown, {}, BattleshipPlacement, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<BattleshipPlacement & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    ships?: import("mongoose").SchemaDefinitionProperty<Ship[], BattleshipPlacement, Document<unknown, {}, BattleshipPlacement, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<BattleshipPlacement & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    shotsFired?: import("mongoose").SchemaDefinitionProperty<number[][], BattleshipPlacement, Document<unknown, {}, BattleshipPlacement, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<BattleshipPlacement & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    ready_at?: import("mongoose").SchemaDefinitionProperty<Date, BattleshipPlacement, Document<unknown, {}, BattleshipPlacement, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<BattleshipPlacement & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, BattleshipPlacement, Document<unknown, {}, BattleshipPlacement, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<BattleshipPlacement & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, BattleshipPlacement>;
