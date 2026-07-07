import { Document, Schema as MongooseSchema, Types } from 'mongoose';
export type WithdrawalDocument = Withdrawal & Document;
export declare class Withdrawal {
    user_id: Types.ObjectId;
    amount: number;
    coin: string;
    wallet: string;
    id_binance: string;
    tx_fee: number;
    transfer_type: string;
    wallet_type: string;
    txId: string;
    network: string;
    status: string;
    created_at: Date;
    confirmed_at: Date;
    confirmed_at_binance: Date;
    verification_code: string;
    verification_expires_at: Date;
}
export declare const WithdrawalSchema: MongooseSchema<Withdrawal, import("mongoose").Model<Withdrawal, any, any, any, any, any, Withdrawal>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Withdrawal, Document<unknown, {}, Withdrawal, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    user_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    amount?: import("mongoose").SchemaDefinitionProperty<number, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    coin?: import("mongoose").SchemaDefinitionProperty<string, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    wallet?: import("mongoose").SchemaDefinitionProperty<string, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    id_binance?: import("mongoose").SchemaDefinitionProperty<string, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    tx_fee?: import("mongoose").SchemaDefinitionProperty<number, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    transfer_type?: import("mongoose").SchemaDefinitionProperty<string, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    wallet_type?: import("mongoose").SchemaDefinitionProperty<string, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    txId?: import("mongoose").SchemaDefinitionProperty<string, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    network?: import("mongoose").SchemaDefinitionProperty<string, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    created_at?: import("mongoose").SchemaDefinitionProperty<Date, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    confirmed_at?: import("mongoose").SchemaDefinitionProperty<Date, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    confirmed_at_binance?: import("mongoose").SchemaDefinitionProperty<Date, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    verification_code?: import("mongoose").SchemaDefinitionProperty<string, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    verification_expires_at?: import("mongoose").SchemaDefinitionProperty<Date, Withdrawal, Document<unknown, {}, Withdrawal, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Withdrawal & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Withdrawal>;
