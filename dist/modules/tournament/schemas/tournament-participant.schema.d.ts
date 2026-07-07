import { Document, Types } from 'mongoose';
import { TournamentParticipantStatus } from '../constants/tournament.constants';
export type TournamentParticipantDocument = TournamentParticipant & Document;
export declare class TournamentParticipant {
    tournament_id: Types.ObjectId;
    user_id: Types.ObjectId;
    username: string;
    status: TournamentParticipantStatus;
    seed?: number;
    group_number?: number;
    registered_at: Date;
    eliminated_at?: Date;
    final_rank?: number;
}
export declare const TournamentParticipantSchema: import("mongoose").Schema<TournamentParticipant, import("mongoose").Model<TournamentParticipant, any, any, any, any, any, TournamentParticipant>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, TournamentParticipant, Document<unknown, {}, TournamentParticipant, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<TournamentParticipant & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    tournament_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, TournamentParticipant, Document<unknown, {}, TournamentParticipant, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentParticipant & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    user_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, TournamentParticipant, Document<unknown, {}, TournamentParticipant, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentParticipant & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    username?: import("mongoose").SchemaDefinitionProperty<string, TournamentParticipant, Document<unknown, {}, TournamentParticipant, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentParticipant & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<TournamentParticipantStatus, TournamentParticipant, Document<unknown, {}, TournamentParticipant, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentParticipant & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    seed?: import("mongoose").SchemaDefinitionProperty<number | undefined, TournamentParticipant, Document<unknown, {}, TournamentParticipant, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentParticipant & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    group_number?: import("mongoose").SchemaDefinitionProperty<number | undefined, TournamentParticipant, Document<unknown, {}, TournamentParticipant, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentParticipant & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    registered_at?: import("mongoose").SchemaDefinitionProperty<Date, TournamentParticipant, Document<unknown, {}, TournamentParticipant, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentParticipant & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    eliminated_at?: import("mongoose").SchemaDefinitionProperty<Date | undefined, TournamentParticipant, Document<unknown, {}, TournamentParticipant, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentParticipant & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    final_rank?: import("mongoose").SchemaDefinitionProperty<number | undefined, TournamentParticipant, Document<unknown, {}, TournamentParticipant, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentParticipant & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, TournamentParticipant>;
