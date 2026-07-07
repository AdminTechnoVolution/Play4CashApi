import { Document, Types } from 'mongoose';
import { TournamentTransactionType } from '../constants/tournament.constants';
export type TournamentTransactionDocument = TournamentTransaction & Document;
export declare class TournamentTransaction {
    tournament_id: Types.ObjectId;
    user_id?: Types.ObjectId;
    type: TournamentTransactionType;
    amount: number;
    status: string;
    idempotency_key?: string;
    reference?: string;
}
export declare const TournamentTransactionSchema: import("mongoose").Schema<TournamentTransaction, import("mongoose").Model<TournamentTransaction, any, any, any, any, any, TournamentTransaction>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, TournamentTransaction, Document<unknown, {}, TournamentTransaction, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<TournamentTransaction & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    tournament_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, TournamentTransaction, Document<unknown, {}, TournamentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentTransaction & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    user_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, TournamentTransaction, Document<unknown, {}, TournamentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentTransaction & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    type?: import("mongoose").SchemaDefinitionProperty<TournamentTransactionType, TournamentTransaction, Document<unknown, {}, TournamentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentTransaction & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    amount?: import("mongoose").SchemaDefinitionProperty<number, TournamentTransaction, Document<unknown, {}, TournamentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentTransaction & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, TournamentTransaction, Document<unknown, {}, TournamentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentTransaction & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    idempotency_key?: import("mongoose").SchemaDefinitionProperty<string | undefined, TournamentTransaction, Document<unknown, {}, TournamentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentTransaction & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    reference?: import("mongoose").SchemaDefinitionProperty<string | undefined, TournamentTransaction, Document<unknown, {}, TournamentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentTransaction & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, TournamentTransaction>;
