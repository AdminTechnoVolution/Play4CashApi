import { Document, Types } from 'mongoose';
import { TournamentMatchRoundName, TournamentMatchStatus, TournamentPhase } from '../constants/tournament.constants';
export type TournamentMatchDocument = TournamentMatch & Document;
export declare class TournamentMatch {
    tournament_id: Types.ObjectId;
    group_number?: number;
    phase: TournamentPhase;
    round_name: TournamentMatchRoundName;
    round_index: number;
    match_index: number;
    status: TournamentMatchStatus;
    player_a_user_id?: Types.ObjectId;
    player_b_user_id?: Types.ObjectId;
    winner_user_id?: Types.ObjectId;
    loser_user_id?: Types.ObjectId;
    room_id?: Types.ObjectId;
    next_match_id?: Types.ObjectId;
    next_slot?: 'A' | 'B';
    is_bye: boolean;
    starts_at?: Date;
    presence_check_at?: Date;
    started_at?: Date;
    finished_at?: Date;
    result_reason?: string;
}
export declare const TournamentMatchSchema: import("mongoose").Schema<TournamentMatch, import("mongoose").Model<TournamentMatch, any, any, any, any, any, TournamentMatch>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, TournamentMatch, Document<unknown, {}, TournamentMatch, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    tournament_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    group_number?: import("mongoose").SchemaDefinitionProperty<number | undefined, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    phase?: import("mongoose").SchemaDefinitionProperty<TournamentPhase, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    round_name?: import("mongoose").SchemaDefinitionProperty<TournamentMatchRoundName, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    round_index?: import("mongoose").SchemaDefinitionProperty<number, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    match_index?: import("mongoose").SchemaDefinitionProperty<number, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<TournamentMatchStatus, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    player_a_user_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    player_b_user_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    winner_user_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    loser_user_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    room_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    next_match_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    next_slot?: import("mongoose").SchemaDefinitionProperty<"A" | "B" | undefined, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    is_bye?: import("mongoose").SchemaDefinitionProperty<boolean, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    starts_at?: import("mongoose").SchemaDefinitionProperty<Date | undefined, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    presence_check_at?: import("mongoose").SchemaDefinitionProperty<Date | undefined, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    started_at?: import("mongoose").SchemaDefinitionProperty<Date | undefined, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    finished_at?: import("mongoose").SchemaDefinitionProperty<Date | undefined, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    result_reason?: import("mongoose").SchemaDefinitionProperty<string | undefined, TournamentMatch, Document<unknown, {}, TournamentMatch, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentMatch & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, TournamentMatch>;
