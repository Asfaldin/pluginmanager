// Klucz localStorage z lokalnym folderem projektu Mainplugins (Maven) - współdzielony
// między zakładką Wdrożenie (gdzie się go ustawia/buduje) i każdym miejscem, które
// potrzebuje znaleźć zbudowany jar w dist/ (patrz LocalExportButton) - ustawiasz raz,
// działa wszędzie.
export const MAINPLUGINS_PROJECT_DIR_KEY = "pluginmanager:deployProjectDir";
