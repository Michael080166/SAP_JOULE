*&---------------------------------------------------------------------*
*& Report  ZSAP_JOULE_INFO_DYNPRO
*&---------------------------------------------------------------------*
*& Zeigt einen mehrteiligen Informationstext in einem MODALEN Dynpro
*& (Modal Dialog Box) an.
*&
*& Der Text wird aus mehreren Teilen (Absaetzen) zusammengesetzt und in
*& einem scrollbaren CL_GUI_TEXTEDIT-Control read-only dargestellt.
*&
*& Aufbau:
*&   - Selektionsbild: kleiner Button / direkter Aufruf
*&   - Screen 0100 : Modaler Dialog (Attribut "Modales Dialogfenster")
*&                   mit Custom Control CC_INFO und Statusleiste
*&
*& WICHTIG: Das Dynpro 0100 und die Ablauflogik (PBO/PAI) muessen im
*&          Screen Painter (SE51) angelegt werden. Die noetigen
*&          Attribute und die Flow-Logic stehen in src/INSTALL.md.
*&---------------------------------------------------------------------*
REPORT zsap_joule_info_dynpro.

*&---------------------------------------------------------------------*
*& Globale Daten
*&---------------------------------------------------------------------*
CONSTANTS: gc_screen_info TYPE sy-dynnr VALUE '0100'.

DATA: go_container TYPE REF TO cl_gui_custom_container,
      go_textedit  TYPE REF TO cl_gui_textedit,
      gt_text      TYPE STANDARD TABLE OF char255,
      gv_title     TYPE char72.

*&---------------------------------------------------------------------*
*& Lokale Klasse: baut den mehrteiligen Text auf
*&---------------------------------------------------------------------*
CLASS lcl_info_text DEFINITION.
  PUBLIC SECTION.
    "! Fuegt einen Textteil (mehrere Zeilen) an den Gesamttext an.
    "! @parameter it_lines | Zeilen des Textteils
    METHODS add_part
      IMPORTING it_lines TYPE string_table.

    "! Fuegt eine Ueberschrift + Trennlinie als Textteil an.
    METHODS add_heading
      IMPORTING iv_heading TYPE string.

    "! Fuegt eine Leerzeile ein.
    METHODS add_blank_line.

    "! Liefert den kompletten Text als Tabelle fuer das TextEdit-Control.
    METHODS get_text
      RETURNING VALUE(rt_text) TYPE STANDARD TABLE OF char255.

  PRIVATE SECTION.
    DATA mt_text TYPE STANDARD TABLE OF char255.
ENDCLASS.

CLASS lcl_info_text IMPLEMENTATION.
  METHOD add_part.
    DATA lv_line TYPE char255.
    LOOP AT it_lines INTO DATA(lv_src).
      lv_line = lv_src.
      APPEND lv_line TO mt_text.
    ENDLOOP.
  ENDMETHOD.

  METHOD add_heading.
    DATA: lv_line TYPE char255,
          lv_rule TYPE char255.
    lv_line = iv_heading.
    APPEND lv_line TO mt_text.
    lv_rule = |{ repeat( val = `-` occ = strlen( iv_heading ) ) }|.
    APPEND lv_rule TO mt_text.
  ENDMETHOD.

  METHOD add_blank_line.
    APPEND space TO mt_text.
  ENDMETHOD.

  METHOD get_text.
    rt_text = mt_text.
  ENDMETHOD.
ENDCLASS.

*&---------------------------------------------------------------------*
*& Selektionsbild
*&---------------------------------------------------------------------*
PARAMETERS: p_show AS CHECKBOX DEFAULT 'X'.  " Info-Dialog anzeigen

*&---------------------------------------------------------------------*
*& Ablauf
*&---------------------------------------------------------------------*
START-OF-SELECTION.
  PERFORM build_info_text.
  IF p_show = abap_true.
    PERFORM show_modal_dialog.
  ENDIF.

*&---------------------------------------------------------------------*
*& Form  build_info_text
*&   Stellt den mehrteiligen Informationstext zusammen.
*&---------------------------------------------------------------------*
FORM build_info_text.
  DATA(lo_info) = NEW lcl_info_text( ).

  gv_title = 'Information zu SAP Joule'.

  " --- Teil 1: Einleitung ---
  lo_info->add_heading( 'Was ist SAP Joule?' ).
  lo_info->add_part( VALUE #(
    ( `SAP Joule ist der generative KI-Assistent (Copilot) von SAP.` )
    ( `Er ist in die SAP-Anwendungen eingebettet und unterstuetzt` )
    ( `Anwender bei ihrer taeglichen Arbeit ueber natuerliche Sprache.` ) ) ).
  lo_info->add_blank_line( ).

  " --- Teil 2: Nutzen ---
  lo_info->add_heading( 'Ihr Nutzen' ).
  lo_info->add_part( VALUE #(
    ( `- Schnellerer Zugriff auf Informationen und Prozesse` )
    ( `- Weniger manuelle Schritte durch Automatisierung` )
    ( `- Kontextbezogene Vorschlaege direkt im Arbeitsablauf` ) ) ).
  lo_info->add_blank_line( ).

  " --- Teil 3: Hinweis ---
  lo_info->add_heading( 'Hinweis' ).
  lo_info->add_part( VALUE #(
    ( `Bitte pruefen Sie die von Joule vorgeschlagenen Ergebnisse,` )
    ( `bevor Sie geschaeftskritische Entscheidungen treffen.` ) ) ).

  gt_text = lo_info->get_text( ).
ENDFORM.

*&---------------------------------------------------------------------*
*& Form  show_modal_dialog
*&   Ruft das modale Dynpro 0100 auf.
*&---------------------------------------------------------------------*
FORM show_modal_dialog.
  " STARTING AT / ENDING AT -> Fenster wird als modales Popup angezeigt.
  " (Spalte-links, Zeile-oben) .. (Spalte-rechts, Zeile-unten)
  CALL SCREEN gc_screen_info STARTING AT 10 3 ENDING AT 90 22.
ENDFORM.

*&---------------------------------------------------------------------*
*& Module  STATUS_0100  OUTPUT   (PBO von Screen 0100)
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'STATUS_0100'.   " GUI-Status mit Funktion 'OK' (Enter/OK)
  SET TITLEBAR  'TB_0100' WITH gv_title.

  " Container + TextEdit-Control nur einmalig erzeugen
  IF go_container IS INITIAL.
    CREATE OBJECT go_container
      EXPORTING
        container_name = 'CC_INFO'
      EXCEPTIONS
        OTHERS         = 1.

    IF sy-subrc = 0.
      CREATE OBJECT go_textedit
        EXPORTING
          parent                 = go_container
          wordwrap_mode          = cl_gui_textedit=>wordwrap_at_windowborder
          wordwrap_to_linebreak_mode = cl_gui_textedit=>false
        EXCEPTIONS
          OTHERS                 = 1.

      IF sy-subrc = 0.
        " Text nur zur Information -> nicht editierbar
        go_textedit->set_readonly_mode(
          readonly_mode = cl_gui_textedit=>true ).
        go_textedit->set_toolbar_mode(
          toolbar_mode = cl_gui_textedit=>false ).
        go_textedit->set_statusbar_mode(
          statusbar_mode = cl_gui_textedit=>false ).

        go_textedit->set_text_as_r3table(
          EXPORTING table = gt_text
          EXCEPTIONS OTHERS = 1 ).

        " Cursor an den Anfang, damit oben gescrollt ist
        go_textedit->set_focus( control = go_textedit ).
      ENDIF.
    ENDIF.
  ENDIF.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module  USER_COMMAND_0100  INPUT   (PAI von Screen 0100)
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.
  CASE sy-ucomm.
    WHEN 'OK' OR 'CANC' OR 'ESC'.
      PERFORM free_controls.
      SET SCREEN 0.       " Dialog schliessen
      LEAVE SCREEN.
  ENDCASE.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Form  free_controls
*&   Gibt die GUI-Controls sauber frei.
*&---------------------------------------------------------------------*
FORM free_controls.
  IF go_textedit IS NOT INITIAL.
    go_textedit->free( EXCEPTIONS OTHERS = 1 ).
    CLEAR go_textedit.
  ENDIF.
  IF go_container IS NOT INITIAL.
    go_container->free( EXCEPTIONS OTHERS = 1 ).
    CLEAR go_container.
  ENDIF.
ENDFORM.
