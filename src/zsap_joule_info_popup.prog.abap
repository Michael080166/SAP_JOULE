*&---------------------------------------------------------------------*
*& Report  ZSAP_JOULE_INFO_POPUP
*&---------------------------------------------------------------------*
*& Schlanke Alternative OHNE eigenes Dynpro/SE51.
*&
*& Zeigt denselben mehrteiligen Informationstext in einem modalen
*& Popup (Standard-Funktionsbaustein POPUP_WITH_TABLE_DISPLAY).
*& Direkt lauffaehig, sobald der Report in SE38 angelegt ist.
*&---------------------------------------------------------------------*
REPORT zsap_joule_info_popup.

TYPES: BEGIN OF ty_line,
         text TYPE char100,
       END OF ty_line.

DATA: gt_text TYPE STANDARD TABLE OF ty_line,
      gs_pos  TYPE cursor.   " Dummy fuer Rueckgabe

*&---------------------------------------------------------------------*
FORM add_line USING iv_text TYPE csequence.
  APPEND VALUE #( text = iv_text ) TO gt_text.
ENDFORM.

START-OF-SELECTION.
  " --- Teil 1: Einleitung ---
  PERFORM add_line USING 'Was ist SAP Joule?'.
  PERFORM add_line USING '-------------------'.
  PERFORM add_line USING 'SAP Joule ist der generative KI-Assistent (Copilot) von SAP.'.
  PERFORM add_line USING 'Er unterstuetzt Anwender ueber natuerliche Sprache.'.
  PERFORM add_line USING space.

  " --- Teil 2: Nutzen ---
  PERFORM add_line USING 'Ihr Nutzen'.
  PERFORM add_line USING '----------'.
  PERFORM add_line USING '- Schnellerer Zugriff auf Informationen und Prozesse'.
  PERFORM add_line USING '- Weniger manuelle Schritte durch Automatisierung'.
  PERFORM add_line USING '- Kontextbezogene Vorschlaege im Arbeitsablauf'.
  PERFORM add_line USING space.

  " --- Teil 3: Hinweis ---
  PERFORM add_line USING 'Hinweis'.
  PERFORM add_line USING '-------'.
  PERFORM add_line USING 'Bitte pruefen Sie die Ergebnisse von Joule vor'.
  PERFORM add_line USING 'geschaeftskritischen Entscheidungen.'.

  DATA lv_end TYPE i.
  lv_end = lines( gt_text ).

  " Modales Popup mit dem mehrteiligen Text
  CALL FUNCTION 'POPUP_WITH_TABLE_DISPLAY'
    EXPORTING
      endpos_col   = 90
      endpos_row   = 25
      startpos_col = 10
      startpos_row = 3
      titletext    = 'Information zu SAP Joule'
    IMPORTING
      choice       = gs_pos
    TABLES
      valuetab     = gt_text
    EXCEPTIONS
      break_off    = 1
      OTHERS       = 2.
