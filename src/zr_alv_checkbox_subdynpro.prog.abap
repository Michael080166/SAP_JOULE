*&---------------------------------------------------------------------*
*& Report  ZR_ALV_CHECKBOX_SUBDYNPRO
*&---------------------------------------------------------------------*
*& Vorlage: Editierbares ALV-Grid (CL_GUI_ALV_GRID) mit
*&          - 1 Checkbox-Spalte  (FLAG)
*&          - 3 String-Spalten   (TEXT1, TEXT2, TEXT3)
*&
*& Das ALV-Grid wird in einem SUBSCREEN (Subdynpro 0110) dargestellt und
*& von einem Rahmen-Dynpro 0100 per CALL SUBSCREEN eingebunden.
*& Die Daten werden über die Tabelle ZALV_DEMO als Datenbank-
*& Schnittstelle gelesen und gespeichert (MODIFY / DELETE).
*&
*& Aufbau:
*&   0100  Rahmen-Dynpro (enthaelt Subscreen-Area SUB_AREA)
*&   0110  Subdynpro     (enthaelt Custom-Control CC_ALV)
*&---------------------------------------------------------------------*
REPORT zr_alv_checkbox_subdynpro.

*----------------------------------------------------------------------*
* Globale Datendeklaration
*----------------------------------------------------------------------*
TABLES zalv_demo.

* Interne Anzeige-/Pflegetabelle inkl. ALV-Statusspalten
TYPES: BEGIN OF ty_alv.
        INCLUDE STRUCTURE zalv_demo.
TYPES:   celltab TYPE lvc_t_styl,   " zellenspezifische Attribute
       END OF ty_alv.

DATA: gt_alv    TYPE STANDARD TABLE OF ty_alv,
      gt_delete TYPE STANDARD TABLE OF zalv_demo.   " zu loeschende Keys

* OO-Referenzen fuer das ALV-Grid im Subscreen
DATA: go_cont TYPE REF TO cl_gui_custom_container,
      go_grid TYPE REF TO cl_gui_alv_grid.

DATA: gs_layout  TYPE lvc_s_layo,
      gt_fcat    TYPE lvc_t_fcat.

DATA: gv_okcode TYPE sy-ucomm,
      gv_subscr TYPE sy-dynnr VALUE '0110'.   " einzubindendes Subdynpro

*----------------------------------------------------------------------*
* Klasse fuer Ereignisbehandlung des ALV
*----------------------------------------------------------------------*
CLASS lcl_event_handler DEFINITION.
  PUBLIC SECTION.
    METHODS:
      on_data_changed
        FOR EVENT data_changed OF cl_gui_alv_grid
        IMPORTING er_data_changed.
ENDCLASS.

CLASS lcl_event_handler IMPLEMENTATION.
  METHOD on_data_changed.
    " Wird nach jeder Zellaenderung ausgeloest. Hier koennten
    " Validierungen erfolgen. Aenderungen sind bereits in gt_alv
    " uebernommen (durch REGISTER_EDIT_EVENT + Protokoll).
  ENDMETHOD.
ENDCLASS.

DATA: go_handler TYPE REF TO lcl_event_handler.

*----------------------------------------------------------------------*
* START-OF-SELECTION
*----------------------------------------------------------------------*
START-OF-SELECTION.
  PERFORM read_data.          " aus DB lesen
  CALL SCREEN 0100.           " Rahmen-Dynpro starten

*&---------------------------------------------------------------------*
*& Form READ_DATA  -  Datenbank-Schnittstelle (Lesen)
*&---------------------------------------------------------------------*
FORM read_data.
  CLEAR gt_alv.
  SELECT mandt key_id flag text1 text2 text3
    FROM zalv_demo
    INTO CORRESPONDING FIELDS OF TABLE gt_alv.  "#EC CI_NOWHERE

  " Ist die Tabelle leer, eine Beispiel-Leerzeile anbieten
  IF gt_alv IS INITIAL.
    PERFORM append_empty_row.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form APPEND_EMPTY_ROW  -  neue Pflegezeile
*&---------------------------------------------------------------------*
FORM append_empty_row.
  DATA ls_alv TYPE ty_alv.
  DATA lv_num TYPE i.

  lv_num = lines( gt_alv ) + 1.
  ls_alv-key_id = |{ lv_num ALPHA = IN }|.
  ls_alv-mandt  = sy-mandt.
  APPEND ls_alv TO gt_alv.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SAVE_DATA  -  Datenbank-Schnittstelle (Speichern)
*&---------------------------------------------------------------------*
FORM save_data.
  DATA lt_db TYPE STANDARD TABLE OF zalv_demo.
  FIELD-SYMBOLS <ls_alv> TYPE ty_alv.

  " Vor dem Sichern die aktuellen Frontend-Aenderungen einsammeln
  IF go_grid IS BOUND.
    go_grid->check_changed_data( ).
  ENDIF.

  " gt_alv -> DB-Struktur uebertragen
  LOOP AT gt_alv ASSIGNING <ls_alv>.
    IF <ls_alv>-key_id IS INITIAL.
      CONTINUE.                     " leere Schluessel nicht sichern
    ENDIF.
    <ls_alv>-mandt = sy-mandt.
    APPEND CORRESPONDING #( <ls_alv> ) TO lt_db.
  ENDLOOP.

  " Geloeschte Zeilen entfernen
  IF gt_delete IS NOT INITIAL.
    DELETE zalv_demo FROM TABLE gt_delete.
    CLEAR gt_delete.
  ENDIF.

  " Einfuegen/Aendern (Upsert)
  IF lt_db IS NOT INITIAL.
    MODIFY zalv_demo FROM TABLE lt_db.
  ENDIF.

  IF sy-subrc = 0.
    COMMIT WORK.
    MESSAGE 'Daten gespeichert' TYPE 'S'.
  ELSE.
    ROLLBACK WORK.
    MESSAGE 'Fehler beim Speichern' TYPE 'S' DISPLAY LIKE 'E'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form BUILD_FIELDCAT  -  Feldkatalog fuer das ALV
*&---------------------------------------------------------------------*
FORM build_fieldcat.
  CLEAR gt_fcat.

  " Feldkatalog aus DDIC-Struktur generieren
  CALL FUNCTION 'LVC_FIELDCATALOG_MERGE'
    EXPORTING
      i_structure_name = 'ZALV_DEMO'
    CHANGING
      ct_fieldcat      = gt_fcat
    EXCEPTIONS
      OTHERS           = 1.

  DATA ls_fcat TYPE lvc_s_fcat.
  LOOP AT gt_fcat INTO ls_fcat.
    CASE ls_fcat-fieldname.
      WHEN 'MANDT'.
        ls_fcat-no_out = abap_true.         " Mandant ausblenden
      WHEN 'KEY_ID'.
        ls_fcat-key      = abap_true.
        ls_fcat-edit     = abap_true.
        ls_fcat-coltext  = 'Schluessel'.
      WHEN 'FLAG'.
        ls_fcat-checkbox = abap_true.       " Checkbox-Spalte
        ls_fcat-edit     = abap_true.
        ls_fcat-coltext  = 'Kennzeichen'.
        ls_fcat-outputlen = 10.
      WHEN 'TEXT1'.
        ls_fcat-edit     = abap_true.
        ls_fcat-coltext  = 'String 1'.
        ls_fcat-outputlen = 30.
      WHEN 'TEXT2'.
        ls_fcat-edit     = abap_true.
        ls_fcat-coltext  = 'String 2'.
        ls_fcat-outputlen = 30.
      WHEN 'TEXT3'.
        ls_fcat-edit     = abap_true.
        ls_fcat-coltext  = 'String 3'.
        ls_fcat-outputlen = 30.
    ENDCASE.
    MODIFY gt_fcat FROM ls_fcat.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form BUILD_LAYOUT
*&---------------------------------------------------------------------*
FORM build_layout.
  CLEAR gs_layout.
  gs_layout-zebra      = abap_true.
  gs_layout-cwidth_opt = abap_true.
  gs_layout-sel_mode   = 'A'.           " Zeilen-/Zellenselektion
  gs_layout-stylefname = 'CELLTAB'.     " zellenspezifische Attribute
ENDFORM.

*&---------------------------------------------------------------------*
*& Form CREATE_ALV  -  ALV im Custom-Control des Subdynpros erzeugen
*&---------------------------------------------------------------------*
FORM create_alv.
  IF go_grid IS BOUND.
    " Bereits erzeugt -> nur neu anzeigen
    go_grid->refresh_table_display( ).
    RETURN.
  ENDIF.

  " Custom-Container an das Control CC_ALV (auf Subdynpro 0110) binden
  CREATE OBJECT go_cont
    EXPORTING
      container_name = 'CC_ALV'
    EXCEPTIONS
      OTHERS         = 1.
  IF sy-subrc <> 0.
    MESSAGE 'Container CC_ALV konnte nicht erzeugt werden' TYPE 'E'.
  ENDIF.

  CREATE OBJECT go_grid
    EXPORTING
      i_parent = go_cont.

  PERFORM build_fieldcat.
  PERFORM build_layout.

  " Editierbare Zellen im Change-Protokoll ueberwachen
  go_grid->register_edit_event(
    EXPORTING i_event_id = cl_gui_alv_grid=>mc_evt_modified
    EXCEPTIONS OTHERS = 0 ).

  CREATE OBJECT go_handler.
  SET HANDLER go_handler->on_data_changed FOR go_grid.

  go_grid->set_table_for_first_display(
    EXPORTING
      is_layout       = gs_layout
    CHANGING
      it_fieldcatalog = gt_fcat
      it_outtab       = gt_alv ).
ENDFORM.

*&---------------------------------------------------------------------*
*& Dynpro 0100  -  Rahmen-Dynpro
*&   Im Screen Painter (SE51):
*&     - Subscreen-Bereich mit Namen 'SUB_AREA' anlegen
*&     - GUI-Status 'STATUS_0100' mit Funktionscodes SAVE, ADD,
*&       DELETE, BACK/EXIT/CANCEL
*&---------------------------------------------------------------------*
*&---------------------------------------------------------------------*
*& Module STATUS_0100 OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'STATUS_0100'.
  SET TITLEBAR  'TITLE_0100'.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module USER_COMMAND_0100 INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.
  DATA lv_ucomm TYPE sy-ucomm.
  lv_ucomm = gv_okcode.
  CLEAR gv_okcode.

  " Frontend-Aenderungen ins Backend uebernehmen
  IF go_grid IS BOUND.
    go_grid->check_changed_data( ).
  ENDIF.

  CASE lv_ucomm.
    WHEN 'SAVE'.
      PERFORM save_data.

    WHEN 'ADD'.
      PERFORM append_empty_row.
      IF go_grid IS BOUND.
        go_grid->refresh_table_display( ).
      ENDIF.

    WHEN 'DELETE'.
      PERFORM delete_selected_rows.

    WHEN 'BACK' OR 'EXIT' OR 'CANCEL'.
      LEAVE TO SCREEN 0.
  ENDCASE.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Form DELETE_SELECTED_ROWS
*&---------------------------------------------------------------------*
FORM delete_selected_rows.
  DATA: lt_rows TYPE lvc_t_row,
        ls_row  TYPE lvc_s_row,
        ls_del  TYPE zalv_demo.
  FIELD-SYMBOLS <ls_alv> TYPE ty_alv.

  IF go_grid IS NOT BOUND.
    RETURN.
  ENDIF.

  go_grid->get_selected_rows( IMPORTING et_index_rows = lt_rows ).

  IF lt_rows IS INITIAL.
    MESSAGE 'Bitte mindestens eine Zeile markieren' TYPE 'S'
            DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.

  " Von hinten nach vorne loeschen, damit die Indizes stabil bleiben
  SORT lt_rows BY index DESCENDING.
  LOOP AT lt_rows INTO ls_row.
    READ TABLE gt_alv ASSIGNING <ls_alv> INDEX ls_row-index.
    IF sy-subrc = 0.
      IF <ls_alv>-key_id IS NOT INITIAL.
        CLEAR ls_del.
        ls_del = CORRESPONDING #( <ls_alv> ).
        ls_del-mandt = sy-mandt.
        APPEND ls_del TO gt_delete.   " beim Sichern aus DB entfernen
      ENDIF.
      DELETE gt_alv INDEX ls_row-index.
    ENDIF.
  ENDLOOP.

  go_grid->refresh_table_display( ).
ENDFORM.

*&---------------------------------------------------------------------*
*& Dynpro 0110  -  Subdynpro (Subscreen)
*&   Im Screen Painter (SE51):
*&     - Dynpro-Typ = 'Subscreen'
*&     - Custom-Control mit Namen 'CC_ALV' anlegen
*&---------------------------------------------------------------------*
*&---------------------------------------------------------------------*
*& Module PBO_0110 OUTPUT
*&---------------------------------------------------------------------*
MODULE pbo_0110 OUTPUT.
  PERFORM create_alv.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module PAI_0110 INPUT
*&---------------------------------------------------------------------*
MODULE pai_0110 INPUT.
  " Eingaben im Subscreen werden ueber das ALV-Grid verarbeitet;
  " hier ist i.d.R. keine weitere Logik notwendig.
ENDMODULE.
