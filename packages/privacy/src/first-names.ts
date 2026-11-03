/**
 * Häufige Vornamen in Deutschland (alle Generationen, inkl. verbreiteter
 * türkischer, arabischer, osteuropäischer und internationaler Namen).
 * Bewusst ausgelassen sind Vornamen, die zugleich gängige deutsche Wörter oder
 * Produkt-/Ortsbezeichnungen sind (z. B. „Mark", „Will", „Rose", „Grace").
 */
const NAMES = `
Aaron Achim Adam Adrian Ahmad Ahmet Alexander Alexandra Alfred Ali Alina Alois Amelie Ana Andrea Andreas Andrej Angela Angelika Anika
Anja Anke Anna Annalena Anne Annegret Annemarie Annette Anni Antje Anton Antonia Arne Arnold Artur Aylin Ayse Ayşe Barbara Bärbel
Ben Benedikt Benjamin Bernd Bernhard Bettina Bianca Birgit Björn Bodo Brigitte Burkhard Carina Carl Carla Carmen Carolin Caroline Carsten
Charlotte Chiara Christa Christel Christian Christiane Christina Christine Christoph Christopher Clara Claudia Claus Cornelia Daniel Daniela Dariusz David
Denis Dennis Detlef Diana Dieter Dietmar Dietrich Dirk Doris Dorothea Dominik Edith Egon Elena Elfriede Elias Elisabeth Elke Ella Ellen
Elif Emil Emilia Emily Emine Emma Emre Engelbert Erich Erik Erika Ernst Erwin Esther Eugen Eva Ewa Fabian Fatima Fatma Felix
Finn Florian Franz Franziska Frauke Frederik Friedrich Frieda Fritz Gabi Gabriele Georg Gerald Gerd Gerda Gerhard Gertrud Gisela Gregor
Gudrun Günter Günther Gustav Hanna Hannah Hannelore Hannes Hans Harald Hartmut Hasan Heike Heiko Heinrich Heinz Helene Helga Helmut
Hendrik Henning Henrik Herbert Hermann Hildegard Holger Horst Hubert Hüseyin Ibrahim Ilse Ina Ines Inge Ingeborg Ingo Ingrid Irene Iris
Irina Irmgard Isabel Isabell Isabella Jakob Jan Jana Janina Janine Janna Jannik Jasmin Jens Jessica Joachim Jochen Johann Johanna Johannes
Jonas Jonathan Jörg Josef Joseph Julia Julian Juliane Julius Jürgen Justus Jutta Kai Karin Karina Karl Karla Karolina Katarzyna Katharina Kathrin
Katja Katrin Kerstin Kevin Kirsten Klara Klaus Konrad Konstantin Kristina Kurt Lara Lars Laura Lea Lena Leni Leon Leonie Lilli Lina
Linda Lisa Lothar Louis Luca Lucas Lukas Ludwig Luise Lutz Magdalena Maik Manfred Manuel Manuela Marc Marcel Marco Marcus Mareike Margarete
Margit Margot Maria Marianne Marie Marina Mario Marion Marius Marko Markus Marlene Marta Martha Martin Martina Mathias Matthias Maximilian Mehmet
Melanie Mia Michael Michaela Michelle Mila Mirko Miriam Mohammed Mohammad Monika Moritz Mustafa Nadine Natalia Natalie Nicole Niklas Nico Nils
Nina Noah Norbert Olaf Olga Oliver Ole Oskar Otto Patricia Patrick Paul Paula Peter Petra Philipp Pia Rainer Ralf Ralph
Regina Reinhard Reinhold Renate Rene René Richard Rita Robert Roland Rolf Roman Ronja Rosemarie Rudolf Ruth Sabine Sabrina Sandra Sara Sarah
Sascha Sebastian Selin Sergej Silke Silvia Simon Simone Sofia Sophia Sophie Stefan Stefanie Steffen Stephan Stephanie Susanne Svea Sven Svenja Swen
Sylvia Tanja Theo Theresa Thomas Thorsten Tim Timo Tobias Tom Torsten Udo Ulla Ulrich Ulrike Ursula Uta Ute Uwe Valentina Vanessa
Vera Verena Viktor Viktoria Volker Walter Waltraud Werner Wilhelm Wolfgang Yannick Yusuf Zeynep
`;

export const FIRST_NAMES: ReadonlySet<string> = new Set(NAMES.split(/\s+/).filter((n) => n.length > 0));
