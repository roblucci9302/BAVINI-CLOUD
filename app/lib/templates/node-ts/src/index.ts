#!/usr/bin/env node
/**
 * Point d'entrée CLI de l'application
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { greet } from './utils/greet.js';

const program = new Command();

program.name('{{PROJECT_NAME}}').description('{{PROJECT_DESCRIPTION}}').version('1.0.0');

// Commande par défaut : greet
program
  .command('greet')
  .description('Affiche un message de bienvenue')
  .argument('[name]', 'Nom à saluer', 'Monde')
  .option('-c, --color <color>', 'Couleur du message', 'green')
  .action((name: string, options: { color: string }) => {
    const message = greet(name);
    const colorFn = chalk[options.color as keyof typeof chalk] || chalk.green;
    console.log((colorFn as (text: string) => string)(message));
  });

// Commande exemple avec spinner
program
  .command('process')
  .description('Exemple de traitement avec spinner')
  .argument('<input>', 'Fichier ou donnée à traiter')
  .action(async (input: string) => {
    const spinner = ora(`Traitement de ${input}...`).start();

    // Simulation d'un traitement async
    await new Promise((resolve) => setTimeout(resolve, 2000));

    spinner.succeed(chalk.green(`Traitement de ${input} terminé !`));
  });

program.parse();
