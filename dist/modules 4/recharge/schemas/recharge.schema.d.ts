import { Document, Types } from 'mongoose';
export type RechargeDocument = Recharge & Document;
export declare class Recharge {
    user_id: Types.ObjectId;
    txId: string;
    amount: number;
    network: string;
    wallet: string;
    coin: string;
    status: string;
    created_at: Date;
    confirmed_at: Date;
    time_processing_expires_at: Date;
}
export declare const RechargeSchema: import("mongoose").Schema<Recharge, import("mongoose").Model<Recharge, any, any, any, any, any, Recharge>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Recharge, Document<unknown, {}, Recharge, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Recharge & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    user_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Recharge, Document<unknown, {}, Recharge, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Recharge & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    txId?: import("mongoose").SchemaDefinitionProperty<string, Recharge, Document<unknown, {}, Recharge, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Recharge & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    amount?: import("mongoose").SchemaDefinitionProperty<number, Recharge, Document<unknown, {}, Recharge, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Recharge & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    network?: import("mongoose").SchemaDefinitionProperty<string, Recharge, Document<unknown, {}, Recharge, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Recharge & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    wallet?: import("mongoose").SchemaDefinitionProperty<string, Recharge, Document<unknown, {}, Recharge, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Recharge & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    coin?: import("mongoose").SchemaDefinitionProperty<string, Recharge, Document<unknown, {}, Recharge, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Recharge & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, Recharge, Document<unknown, {}, Recharge, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Recharge & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    created_at?: import("mongoose").SchemaDefinitionProperty<Date, Recharge, Document<unknown, {}, Recharge, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Recharge & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    confirmed_at?: import("mongoose").SchemaDefinitionProperty<Date, Recharge, Document<unknown, {}, Recharge, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Recharge & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    time_processing_expires_at?: import("mongoose").SchemaDefinitionProperty<Date, Recharge, Document<unknown, {}, Recharge, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Recharge & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Recharge>;
