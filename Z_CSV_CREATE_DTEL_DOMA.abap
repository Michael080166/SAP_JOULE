*&---------------------------------------------------------------------*
*& Report Z_CSV_CREATE_DTEL_DOMA
*&---------------------------------------------------------------------*
*& Liest aus einer CSV-Datei die Definition von Datenelementen ein und
*& legt je Zeile eine Domaene und ein gleichnamiges Datenelement an.
*&
*& Aufbau der CSV-Datei (Trennzeichen wahlbar, Default ';'):
*&  1.  NAME            - Name von Datenelement UND Domaene (gleich)
*&  2.  BEZEICHNUNG     - Kurzbeschreibung (DDTEXT) des Datenelements
*&  3.  DATENTYP        - Datentyp der Domaene (z.B. CHAR, NUMC, DEC,
*&                        INT4, DATS, CURR, QUAN ...)
*&  4.  STELLEN         - Anzahl Stellen (Laenge)
*&  5.  DEZIMALSTELLEN  - Anzahl Dezimalstellen
*&  6.  VORZEICHEN      - Vorzeichen 'X' = mit Vorzeichen, sonst ohne
*&  7.  KLEINBUCHSTABEN - 'X' = Kleinbuchstaben erlaubt, sonst nicht
*&  8.  FELD_KURZ       - Feldbezeichnung kurz   (max. 10 Zeichen)
*&  9.  FELD_MITTEL     - Feldbezeichnung mittel (max. 20 Zeichen)
*& 10.  FELD_LANG       - Feldbezeichnung lang   (max. 40 Zeichen)
*& 11.  FELD_UEBERSCHR  - Feldbezeichnung Ueberschrift (max. 55 Zeichen)
*&
*& Sind die Feldbezeichnungen (Spalten 8-11) leer, werden sie aus der
*& Bezeichnung (Spalte 2) abgeleitet.
*&
*& Eine fuehrende Kopfzeile kann ueber den Parameter P_HEAD uebersprungen
*& werden.
*&---------------------------------------------------------------------*
REPORT z_csv_create_dtel_doma.

TYPE-POOLS: abap.

*----------------------------------------------------------------------*
* Struktur einer eingelesenen CSV-Zeile
*----------------------------------------------------------------------*
TYPES: BEGIN OF ty_csv_line,
         name        TYPE rollname,        " = Domaenenname
         bezeichnung TYPE as4text,         " Kurzbeschreibung
         datentyp    TYPE dd01v-datatype,  " Datentyp
         stellen     TYPE dd01v-leng,      " Anzahl Stellen
         dezimal     TYPE dd01v-decimals,  " Dezimalstellen
         vorzeichen  TYPE dd01v-signflag,  " Vorzeichen
         lowercase   TYPE dd01v-lowercase, " Kleinbuchstaben
         feld_kurz   TYPE dd04v-scrtext_s, " Feldbezeichnung kurz
         feld_mittel TYPE dd04v-scrtext_m, " Feldbezeichnung mittel
         feld_lang   TYPE dd04v-scrtext_l, " Feldbezeichnung lang
         feld_ueber  TYPE dd04v-reptext,   " Feldbezeichnung Ueberschr.
       END OF ty_csv_line.

DATA: gt_csv  TYPE STANDARD TABLE OF ty_csv_line,
      gs_csv  TYPE ty_csv_line.

DATA: gt_raw  TYPE STANDARD TABLE OF string,
      gv_raw  TYPE string.

*----------------------------------------------------------------------*
* Selektionsbild
*----------------------------------------------------------------------*
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-b01.
PARAMETERS: p_file  TYPE string LOWER CASE OBLIGATORY.
PARAMETERS: p_sep   TYPE c LENGTH 1 DEFAULT ';'.
PARAMETERS: p_head  AS CHECKBOX DEFAULT 'X'.
PARAMETERS: p_dev   TYPE tadir-devclass DEFAULT '$TMP'.
PARAMETERS: p_order TYPE e070-trkorr.          " Transportauftrag
PARAMETERS: p_test  AS CHECKBOX DEFAULT 'X'.   " nur pruefen, nicht anlegen
SELECTION-SCREEN END OF BLOCK b1.

*----------------------------------------------------------------------*
* F4-Hilfe fuer Dateiauswahl
*----------------------------------------------------------------------*
AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_file.
  DATA: lt_files TYPE filetable,
        ls_file  TYPE file_table,
        lv_rc    TYPE i.
  CALL METHOD cl_gui_frontend_services=>file_open_dialog
    EXPORTING
      window_title = 'CSV-Datei auswaehlen'
      file_filter  = 'CSV (*.csv)|*.csv|Alle (*.*)|*.*'
    CHANGING
      file_table   = lt_files
      rc           = lv_rc.
  READ TABLE lt_files INTO ls_file INDEX 1.
  IF sy-subrc = 0.
    p_file = ls_file-filename.
  ENDIF.

*----------------------------------------------------------------------*
* F4-Hilfe fuer Transportauftrag (Workbench-Auftrag)
*----------------------------------------------------------------------*
AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_order.
  CALL FUNCTION 'TRINT_ORDER_CHOICE'
    EXPORTING
      wi_order_type          = 'K'   " Workbench-Auftrag
      wi_task_type           = 'S'   " Entwicklung/Korrektur
    IMPORTING
      we_order               = p_order
    EXCEPTIONS
      no_correction_selected = 1
      display_mode           = 2
      object_append_error    = 3
      recursive_call         = 4
      wrong_order_type       = 5
      OTHERS                 = 6.
  IF sy-subrc <> 0.
    CLEAR p_order.
  ENDIF.

*----------------------------------------------------------------------*
* Pruefung des Selektionsbildes
*----------------------------------------------------------------------*
AT SELECTION-SCREEN.
  " Bei einem nicht lokalen Paket ist ein Transportauftrag erforderlich
  IF p_test = abap_false AND p_dev <> '$TMP' AND p_order IS INITIAL.
    MESSAGE 'Bitte einen Transportauftrag angeben (Paket ungleich $TMP)' TYPE 'E'.
  ENDIF.

*----------------------------------------------------------------------*
START-OF-SELECTION.
  PERFORM f_read_csv.
  PERFORM f_process.

*&---------------------------------------------------------------------*
*& Form F_READ_CSV - CSV-Datei vom Frontend lesen und parsen
*&---------------------------------------------------------------------*
FORM f_read_csv.

  DATA: lv_filename TYPE string,
        lv_first    TYPE abap_bool VALUE abap_true.

  lv_filename = p_file.

  CALL METHOD cl_gui_frontend_services=>gui_upload
    EXPORTING
      filename = lv_filename
      filetype = 'ASC'
    CHANGING
      data_tab = gt_raw
    EXCEPTIONS
      OTHERS   = 1.
  IF sy-subrc <> 0.
    MESSAGE 'Datei konnte nicht gelesen werden' TYPE 'E'.
    RETURN.
  ENDIF.

  LOOP AT gt_raw INTO gv_raw.

    " ggf. Kopfzeile ueberspringen
    IF lv_first = abap_true.
      lv_first = abap_false.
      IF p_head = abap_true.
        CONTINUE.
      ENDIF.
    ENDIF.

    " Leerzeilen ignorieren
    IF gv_raw IS INITIAL.
      CONTINUE.
    ENDIF.

    CLEAR gs_csv.
    SPLIT gv_raw AT p_sep INTO
      gs_csv-name
      gs_csv-bezeichnung
      gs_csv-datentyp
      gs_csv-stellen
      gs_csv-dezimal
      gs_csv-vorzeichen
      gs_csv-lowercase
      gs_csv-feld_kurz
      gs_csv-feld_mittel
      gs_csv-feld_lang
      gs_csv-feld_ueber.

    " Aufbereitung
    TRANSLATE gs_csv-name     TO UPPER CASE.
    TRANSLATE gs_csv-datentyp TO UPPER CASE.
    CONDENSE: gs_csv-name, gs_csv-datentyp,
              gs_csv-vorzeichen, gs_csv-lowercase.

    " Vorzeichen / Kleinbuchstaben normalisieren ('X' oder leer)
    IF gs_csv-vorzeichen CA 'xX1'.
      gs_csv-vorzeichen = 'X'.
    ELSE.
      CLEAR gs_csv-vorzeichen.
    ENDIF.
    IF gs_csv-lowercase CA 'xX1'.
      gs_csv-lowercase = 'X'.
    ELSE.
      CLEAR gs_csv-lowercase.
    ENDIF.

    " Feldbezeichnungen aus Bezeichnung ableiten, wenn leer
    IF gs_csv-feld_kurz   IS INITIAL. gs_csv-feld_kurz   = gs_csv-bezeichnung. ENDIF.
    IF gs_csv-feld_mittel IS INITIAL. gs_csv-feld_mittel = gs_csv-bezeichnung. ENDIF.
    IF gs_csv-feld_lang   IS INITIAL. gs_csv-feld_lang   = gs_csv-bezeichnung. ENDIF.
    IF gs_csv-feld_ueber  IS INITIAL. gs_csv-feld_ueber  = gs_csv-bezeichnung. ENDIF.

    APPEND gs_csv TO gt_csv.
  ENDLOOP.

  IF gt_csv IS INITIAL.
    MESSAGE 'Keine Datensaetze in der CSV-Datei gefunden' TYPE 'E'.
  ENDIF.

ENDFORM.

*&---------------------------------------------------------------------*
*& Form F_PROCESS - je Zeile Domaene + Datenelement anlegen
*&---------------------------------------------------------------------*
FORM f_process.

  DATA: lv_ok      TYPE abap_bool,
        lv_msg     TYPE string,
        lv_cnt_ok  TYPE i,
        lv_cnt_err TYPE i.

  LOOP AT gt_csv INTO gs_csv.

    CLEAR: lv_ok, lv_msg.

    " --- Validierung ---
    PERFORM f_validate USING gs_csv CHANGING lv_ok lv_msg.
    IF lv_ok = abap_false.
      ADD 1 TO lv_cnt_err.
      WRITE: / icon_red_light AS ICON, gs_csv-name, lv_msg.
      CONTINUE.
    ENDIF.

    IF p_test = abap_true.
      " Nur Pruefen, nichts anlegen
      WRITE: / icon_yellow_light AS ICON, gs_csv-name,
               'OK (Testlauf - nicht angelegt)'.
      ADD 1 TO lv_cnt_ok.
      CONTINUE.
    ENDIF.

    " --- 1. Domaene anlegen ---
    PERFORM f_create_domain USING gs_csv CHANGING lv_ok lv_msg.
    IF lv_ok = abap_false.
      ADD 1 TO lv_cnt_err.
      WRITE: / icon_red_light AS ICON, gs_csv-name,
               'Domaene:', lv_msg.
      CONTINUE.
    ENDIF.

    " --- 2. Datenelement anlegen ---
    PERFORM f_create_dtel USING gs_csv CHANGING lv_ok lv_msg.
    IF lv_ok = abap_false.
      ADD 1 TO lv_cnt_err.
      WRITE: / icon_red_light AS ICON, gs_csv-name,
               'Datenelement:', lv_msg.
      CONTINUE.
    ENDIF.

    ADD 1 TO lv_cnt_ok.
    WRITE: / icon_green_light AS ICON, gs_csv-name,
             'Domaene + Datenelement angelegt'.

  ENDLOOP.

  ULINE.
  WRITE: / 'Verarbeitet :', lines( gt_csv ).
  WRITE: / 'Erfolgreich :', lv_cnt_ok.
  WRITE: / 'Fehlerhaft  :', lv_cnt_err.

ENDFORM.

*&---------------------------------------------------------------------*
*& Form F_VALIDATE - fachliche Pruefung einer Zeile
*&---------------------------------------------------------------------*
FORM f_validate USING    ps_csv TYPE ty_csv_line
                CHANGING pv_ok  TYPE abap_bool
                         pv_msg TYPE string.

  pv_ok = abap_true.

  IF ps_csv-name IS INITIAL.
    pv_ok = abap_false.
    pv_msg = 'Name fehlt'.
    RETURN.
  ENDIF.

  " Namenskonvention: Kundennamensraum
  IF ps_csv-name(1) CA 'YZ' OR ps_csv-name(1) = '/'.
    " ok
  ELSE.
    pv_ok = abap_false.
    pv_msg = 'Name nicht im Kundennamensraum (Y/Z/...)'.
    RETURN.
  ENDIF.

  IF ps_csv-datentyp IS INITIAL.
    pv_ok = abap_false.
    pv_msg = 'Datentyp fehlt'.
    RETURN.
  ENDIF.

  IF ps_csv-stellen IS INITIAL AND
     ps_csv-datentyp NA 'INT'.   " INT1/INT2/INT4 ohne Laenge ok
    " viele Typen brauchen eine Laenge - pruefen wir tolerant
  ENDIF.

ENDFORM.

*&---------------------------------------------------------------------*
*& Form F_CREATE_DOMAIN - Domaene ueber DDIF_DOMA_PUT anlegen
*&---------------------------------------------------------------------*
FORM f_create_domain USING    ps_csv TYPE ty_csv_line
                     CHANGING pv_ok  TYPE abap_bool
                              pv_msg TYPE string.

  DATA: ls_dd01v  TYPE dd01v,
        lv_name   TYPE ddobjname,
        lv_outlen TYPE dd01v-outputlen.

  pv_ok  = abap_true.
  lv_name = ps_csv-name.

  " Ausgabelaenge bestimmen
  PERFORM f_calc_outputlen USING ps_csv CHANGING lv_outlen.

  ls_dd01v-domname    = ps_csv-name.
  ls_dd01v-ddlanguage = sy-langu.
  ls_dd01v-datatype   = ps_csv-datentyp.
  " Groessen mit Alpha-Exit (fuehrende Nullen) uebertragen
  PERFORM f_alpha USING ps_csv-stellen CHANGING ls_dd01v-leng.
  PERFORM f_alpha USING ps_csv-dezimal CHANGING ls_dd01v-decimals.
  PERFORM f_alpha USING lv_outlen      CHANGING ls_dd01v-outputlen.
  ls_dd01v-lowercase  = ps_csv-lowercase.
  ls_dd01v-signflag   = ps_csv-vorzeichen.
  " Domaenenbeschreibung = Beschreibung des Datenelements mit Praefix 'Domäne'
  ls_dd01v-ddtext     = |Domäne { ps_csv-bezeichnung }|.

  CALL FUNCTION 'DDIF_DOMA_PUT'
    EXPORTING
      name              = lv_name
      dd01v_wa          = ls_dd01v
    EXCEPTIONS
      doma_not_found    = 1
      name_inconsistent = 2
      doma_inconsistent = 3
      put_failure       = 4
      put_refused       = 5
      OTHERS            = 6.
  IF sy-subrc <> 0.
    pv_ok = abap_false.
    pv_msg = |DDIF_DOMA_PUT subrc={ sy-subrc }|.
    RETURN.
  ENDIF.

  " In Transportauftrag / Paket eintragen
  PERFORM f_register_object USING 'DOMA' ps_csv-name CHANGING pv_ok pv_msg.
  IF pv_ok = abap_false.
    RETURN.
  ENDIF.

  " Aktivieren
  CALL FUNCTION 'DDIF_DOMA_ACTIVATE'
    EXPORTING
      name        = lv_name
    EXCEPTIONS
      not_found   = 1
      put_failure = 2
      OTHERS      = 3.
  IF sy-subrc <> 0.
    pv_ok = abap_false.
    pv_msg = |DDIF_DOMA_ACTIVATE subrc={ sy-subrc }|.
  ENDIF.

ENDFORM.

*&---------------------------------------------------------------------*
*& Form F_CREATE_DTEL - Datenelement ueber DDIF_DTEL_PUT anlegen
*&---------------------------------------------------------------------*
FORM f_create_dtel USING    ps_csv TYPE ty_csv_line
                   CHANGING pv_ok  TYPE abap_bool
                            pv_msg TYPE string.

  DATA: ls_dd04v TYPE dd04v,
        lv_name  TYPE ddobjname.

  pv_ok   = abap_true.
  lv_name = ps_csv-name.

  ls_dd04v-rollname   = ps_csv-name.
  ls_dd04v-ddlanguage = sy-langu.
  ls_dd04v-domname    = ps_csv-name.        " gleichnamige Domaene
  ls_dd04v-ddtext     = ps_csv-bezeichnung. " Kurzbeschreibung

  " Feldbezeichnungen
  ls_dd04v-scrtext_s  = ps_csv-feld_kurz.
  ls_dd04v-scrtext_m  = ps_csv-feld_mittel.
  ls_dd04v-scrtext_l  = ps_csv-feld_lang.
  ls_dd04v-reptext    = ps_csv-feld_ueber.

  " Laengen der Feldbezeichnungen mit Alpha-Exit (fuehrende Nullen)
  DATA lv_len TYPE c LENGTH 6.
  lv_len = strlen( ps_csv-feld_kurz ).
  PERFORM f_alpha USING lv_len CHANGING ls_dd04v-scrlen1.
  lv_len = strlen( ps_csv-feld_mittel ).
  PERFORM f_alpha USING lv_len CHANGING ls_dd04v-scrlen2.
  lv_len = strlen( ps_csv-feld_lang ).
  PERFORM f_alpha USING lv_len CHANGING ls_dd04v-scrlen3.
  lv_len = strlen( ps_csv-feld_ueber ).
  PERFORM f_alpha USING lv_len CHANGING ls_dd04v-headlen.

  CALL FUNCTION 'DDIF_DTEL_PUT'
    EXPORTING
      name              = lv_name
      dd04v_wa          = ls_dd04v
    EXCEPTIONS
      dtel_not_found    = 1
      name_inconsistent = 2
      dtel_inconsistent = 3
      put_failure       = 4
      put_refused       = 5
      OTHERS            = 6.
  IF sy-subrc <> 0.
    pv_ok = abap_false.
    pv_msg = |DDIF_DTEL_PUT subrc={ sy-subrc }|.
    RETURN.
  ENDIF.

  " In Transportauftrag / Paket eintragen
  PERFORM f_register_object USING 'DTEL' ps_csv-name CHANGING pv_ok pv_msg.
  IF pv_ok = abap_false.
    RETURN.
  ENDIF.

  " Aktivieren
  CALL FUNCTION 'DDIF_DTEL_ACTIVATE'
    EXPORTING
      name        = lv_name
    EXCEPTIONS
      not_found   = 1
      put_failure = 2
      OTHERS      = 3.
  IF sy-subrc <> 0.
    pv_ok = abap_false.
    pv_msg = |DDIF_DTEL_ACTIVATE subrc={ sy-subrc }|.
  ENDIF.

ENDFORM.

*&---------------------------------------------------------------------*
*& Form F_REGISTER_OBJECT - Objektkatalogeintrag (TADIR) erzeugen UND
*&                          Objekt dem Transportauftrag zuordnen.
*& RS_CORR_INSERT legt den TADIR-Eintrag an und haengt das Objekt bei
*& transportfaehigem Paket an den uebergebenen Auftrag (P_ORDER) an.
*& Bei lokalem Paket ($TMP) erfolgt keine Transportzuordnung.
*&---------------------------------------------------------------------*
FORM f_register_object USING    pv_class TYPE c          " 'DOMA' / 'DTEL'
                                pv_name  TYPE rollname
                       CHANGING pv_ok    TYPE abap_bool
                                pv_msg   TYPE string.

  DATA: lv_obj   TYPE e071-obj_name,
        lv_class TYPE e071-object,
        lv_order TYPE e070-trkorr.

  pv_ok    = abap_true.
  lv_obj   = pv_name.
  lv_class = pv_class.
  lv_order = p_order.

  CALL FUNCTION 'RS_CORR_INSERT'
    EXPORTING
      object              = lv_obj
      object_class        = lv_class
      devclass            = p_dev
      master_language     = sy-langu
      mode                = 'I'
      global_lock         = abap_true
      korrnum             = lv_order
    IMPORTING
      korrnum             = lv_order
    EXCEPTIONS
      cancelled           = 1
      permission_failure  = 2
      unknown_objectclass = 3
      OTHERS              = 4.
  IF sy-subrc <> 0.
    pv_ok  = abap_false.
    pv_msg = |RS_CORR_INSERT subrc={ sy-subrc }|.
    RETURN.
  ENDIF.

  " gewaehlten/erzeugten Auftrag fuer die weiteren Objekte uebernehmen
  IF p_order IS INITIAL AND lv_order IS NOT INITIAL.
    p_order = lv_order.
  ENDIF.

ENDFORM.

*&---------------------------------------------------------------------*
*& Form F_CALC_OUTPUTLEN - Ausgabelaenge der Domaene bestimmen
*&---------------------------------------------------------------------*
FORM f_calc_outputlen USING    ps_csv  TYPE ty_csv_line
                      CHANGING pv_out  TYPE dd01v-outputlen.

  " Standard: Ausgabelaenge = Anzahl Stellen
  pv_out = ps_csv-stellen.

  CASE ps_csv-datentyp.
    WHEN 'DEC' OR 'CURR' OR 'QUAN'.
      " Stellen + ggf. Dezimaltrennzeichen + Vorzeichen
      pv_out = ps_csv-stellen.
      IF ps_csv-dezimal > 0.
        pv_out = pv_out + 1.            " Dezimaltrennzeichen
      ENDIF.
      IF ps_csv-vorzeichen = 'X'.
        pv_out = pv_out + 1.            " Vorzeichen
      ENDIF.
    WHEN 'DATS'.
      pv_out = 10.                      " TT.MM.JJJJ
    WHEN 'TIMS'.
      pv_out = 8.                       " HH:MM:SS
    WHEN 'INT1'.
      pv_out = 3.
    WHEN 'INT2'.
      pv_out = 6.
    WHEN 'INT4'.
      pv_out = 11.
    WHEN OTHERS.
      pv_out = ps_csv-stellen.
  ENDCASE.

  IF pv_out IS INITIAL.
    pv_out = ps_csv-stellen.
  ENDIF.

ENDFORM.

*&---------------------------------------------------------------------*
*& Form F_ALPHA - Wert ueber den ALPHA-Eingabe-Exit konvertieren
*& (rechtsbuendig mit fuehrenden Nullen), wie es die DDIC-Laengenfelder
*& (LENG, DECIMALS, OUTPUTLEN, SCRLEN*, HEADLEN) erwarten.
*&---------------------------------------------------------------------*
FORM f_alpha USING    pv_in  TYPE clike
             CHANGING pv_out TYPE clike.

  CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
    EXPORTING
      input  = pv_in
    IMPORTING
      output = pv_out.

ENDFORM.
