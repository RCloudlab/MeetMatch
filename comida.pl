% =============================================================================
% Motor Lógico de Match Culinario (Prolog Puro) - comida.pl
% =============================================================================
% Este script calcula la compatibilidad entre dos usuarios basándose únicamente
% en listas de preferencias que se le pasan por parámetro, utilizando
% recursividad pura y procesamiento de listas.
% =============================================================================

% -----------------------------------------------------------------------------
% Reglas Auxiliares Recursivas
% -----------------------------------------------------------------------------

% miembro(Elemento, Lista)
% Verifica recursivamente si un elemento pertenece a una lista.
miembro(X, [X|_]) :- !.
miembro(X, [_|Resto]) :-
    miembro(X, Resto).

% longitud(Lista, Longitud)
% Cuenta recursivamente la cantidad de elementos en una lista.
longitud([], 0) :- !.
longitud([_|Resto], N) :-
    longitud(Resto, N1),
    N is N1 + 1.

% elementos_comunes(Lista1, Lista2, Comunes)
% Filtra y devuelve los elementos que se encuentran en ambas listas.
elementos_comunes([], _, []) :- !.
elementos_comunes([X|Resto], Lista2, [X|Comunes]) :-
    miembro(X, Lista2),
    !,
    elementos_comunes(Resto, Lista2, Comunes).
elementos_comunes([_|Resto], Lista2, Comunes) :-
    elementos_comunes(Resto, Lista2, Comunes).

% -----------------------------------------------------------------------------
% Regla Principal: calcular_match_detallado/7
% -----------------------------------------------------------------------------
% Recibe las listas de áreas y categorías de ambos usuarios, y determina:
% - Porcentaje: Coeficiente de afinidad de Sørensen-Dice (0-100%)
% - AreasComunes: Lista de áreas que ambos comparten.
% - CatsComunes: Lista de categorías que ambos comparten.
calcular_match_detallado(AreasU1, CatsU1, AreasU2, CatsU2, Porcentaje, AreasComunes, CatsComunes) :-
    % Obtener elementos en común
    elementos_comunes(AreasU1, AreasU2, AreasComunes),
    elementos_comunes(CatsU1, CatsU2, CatsComunes),
    
    % Calcular longitudes de las listas de entrada
    longitud(AreasU1, LenA1),
    longitud(AreasU2, LenA2),
    longitud(CatsU1, LenC1),
    longitud(CatsU2, LenC2),
    
    % Calcular longitudes de los elementos comunes
    longitud(AreasComunes, NumAreas),
    longitud(CatsComunes, NumCats),
    
    % Aplicar el coeficiente de Sørensen-Dice: (2 * Comunes) / (Total de preferencias)
    TotalPreferencias is LenA1 + LenA2 + LenC1 + LenC2,
    CoincidenciasTotales is NumAreas + NumCats,
    
    (TotalPreferencias > 0 ->
        Porcentaje is (CoincidenciasTotales * 2 / TotalPreferencias) * 100
    ;
        Porcentaje is 0
    ).
