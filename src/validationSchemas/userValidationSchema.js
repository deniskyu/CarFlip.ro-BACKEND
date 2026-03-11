export const userValidationSchema = {
    username:{
        isLength:{
            options:{
                min:3,
                max: 16,
            },
            errorMessage:"Numele trebuie sa contina 3-16 caractere."
        },
        notEmpty:{
            errorMessage:"Introduceti numele."
        },
        isAlphanumeric:{
            errorMessage:"Numele trebuie sa contina doar litere si cifre."
        }
    },
    password:{
        isLength:{
            options:{
                min:8,
                max: 32,
            },
            errorMessage:"Parola trebuie sa contina minim 8 caractere."
        },
        notEmpty:{
            errorMessage:"Introduceti parola."
        }
    },
    email:{
        isLength:{
            options:{
                min:2,
                max: 52,
            },
            errorMessage:"Emailul trebuie sa contina maxim 52 caractere."
        },
        notEmpty:{
            errorMessage: "Introduceti emailul."
        },
        isEmail:{
            errorMessage: "Emailul este invalid."
        }
    }
}