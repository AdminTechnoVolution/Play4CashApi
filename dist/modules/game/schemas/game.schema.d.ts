import { Document } from 'mongoose';
export type GameDocument = Game & Document;
export declare class LanguageField {
    es: string;
    en: string;
    fr: string;
    de: string;
    it: string;
    pt: string;
}
export declare const LanguageFieldSchema: import("mongoose").Schema<LanguageField, import("mongoose").Model<LanguageField, any, any, any, any, any, LanguageField>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, LanguageField, Document<unknown, {}, LanguageField, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<LanguageField & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    es?: import("mongoose").SchemaDefinitionProperty<string, LanguageField, Document<unknown, {}, LanguageField, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<LanguageField & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    en?: import("mongoose").SchemaDefinitionProperty<string, LanguageField, Document<unknown, {}, LanguageField, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<LanguageField & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    fr?: import("mongoose").SchemaDefinitionProperty<string, LanguageField, Document<unknown, {}, LanguageField, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<LanguageField & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    de?: import("mongoose").SchemaDefinitionProperty<string, LanguageField, Document<unknown, {}, LanguageField, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<LanguageField & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    it?: import("mongoose").SchemaDefinitionProperty<string, LanguageField, Document<unknown, {}, LanguageField, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<LanguageField & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    pt?: import("mongoose").SchemaDefinitionProperty<string, LanguageField, Document<unknown, {}, LanguageField, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<LanguageField & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, LanguageField>;
export declare class Game {
    name: LanguageField;
    description: LanguageField;
    rules: LanguageField[];
    active: boolean;
    min_players: number;
    max_players: number;
    min_bet: number;
    default_bets: number[];
    house_edge: number;
    socket_code: string;
    turn_timer_seconds: number;
    uno_match_target?: number;
    created_at: Date;
}
export declare const GameSchema: import("mongoose").Schema<Game, import("mongoose").Model<Game, any, any, any, any, any, Game>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Game, Document<unknown, {}, Game, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Game & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    name?: import("mongoose").SchemaDefinitionProperty<LanguageField, Game, Document<unknown, {}, Game, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Game & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    description?: import("mongoose").SchemaDefinitionProperty<LanguageField, Game, Document<unknown, {}, Game, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Game & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    rules?: import("mongoose").SchemaDefinitionProperty<LanguageField[], Game, Document<unknown, {}, Game, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Game & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    active?: import("mongoose").SchemaDefinitionProperty<boolean, Game, Document<unknown, {}, Game, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Game & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    min_players?: import("mongoose").SchemaDefinitionProperty<number, Game, Document<unknown, {}, Game, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Game & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    max_players?: import("mongoose").SchemaDefinitionProperty<number, Game, Document<unknown, {}, Game, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Game & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    min_bet?: import("mongoose").SchemaDefinitionProperty<number, Game, Document<unknown, {}, Game, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Game & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    default_bets?: import("mongoose").SchemaDefinitionProperty<number[], Game, Document<unknown, {}, Game, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Game & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    house_edge?: import("mongoose").SchemaDefinitionProperty<number, Game, Document<unknown, {}, Game, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Game & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    socket_code?: import("mongoose").SchemaDefinitionProperty<string, Game, Document<unknown, {}, Game, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Game & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    turn_timer_seconds?: import("mongoose").SchemaDefinitionProperty<number, Game, Document<unknown, {}, Game, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Game & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    uno_match_target?: import("mongoose").SchemaDefinitionProperty<number | undefined, Game, Document<unknown, {}, Game, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Game & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    created_at?: import("mongoose").SchemaDefinitionProperty<Date, Game, Document<unknown, {}, Game, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Game & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Game>;
