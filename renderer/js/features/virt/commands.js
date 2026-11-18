// Section Virtualisation : catalogue de commandes à copier ou lancer dans le terminal.
//
// Pour ajouter une commande : ajoute un objet { title, desc, cmd } dans `vm` (pour une machine précise)
// ou `general` (pour tout l'hyperviseur) du bon hyperviseur.
//   {name} = nom de la machine sélectionnée      {id} = son identifiant
//   <texte> = valeur à saisir (demandée avant de lancer dans le terminal ; copiée telle quelle)
//   danger : true  -> confirmation avant de lancer          shell : 'powershell' -> enveloppé pour cmd.exe
window.VIRT_COMMANDS = {
  virtualbox: {
    vm: [
      { title: 'Infos complètes', desc: 'Configuration, réseau, disques, état', cmd: 'VBoxManage showvminfo "{name}"' },
      { title: 'Démarrer sans fenêtre (headless)', desc: 'Pratique pour un serveur', cmd: 'VBoxManage startvm "{name}" --type headless' },
      { title: 'Éteindre proprement (ACPI)', cmd: 'VBoxManage controlvm "{name}" acpipowerbutton' },
      { title: 'Forcer l\'arrêt', desc: 'Équivaut à débrancher la prise', cmd: 'VBoxManage controlvm "{name}" poweroff', danger: true },
      { title: 'Lister les instantanés', cmd: 'VBoxManage snapshot "{name}" list' },
      { title: 'Créer un instantané', cmd: 'VBoxManage snapshot "{name}" take "<nom>"' },
      { title: 'Restaurer un instantané', desc: 'La machine doit être éteinte', cmd: 'VBoxManage snapshot "{name}" restore "<nom>"', danger: true },
      { title: 'Redirection de port SSH (NAT)', desc: 'Machine éteinte : ssh -p 2222 user@127.0.0.1', cmd: 'VBoxManage modifyvm "{name}" --natpf1 "ssh,tcp,,2222,,22"' },
      { title: 'Adresse IP de l\'invité', desc: 'Nécessite les Additions invité', cmd: 'VBoxManage guestproperty get "{name}" "/VirtualBox/GuestInfo/Net/0/V4/IP"' },
      { title: 'Ajouter un dossier partagé', cmd: 'VBoxManage sharedfolder add "{name}" --name "<nom>" --hostpath "<chemin>" --automount' },
      { title: 'Cloner la machine', cmd: 'VBoxManage clonevm "{name}" --name "{name}-clone" --register' },
      { title: 'Exporter en OVA', cmd: 'VBoxManage export "{name}" -o "<chemin>.ova"' },
      { title: 'Changer la RAM et les CPU', desc: 'Machine éteinte', cmd: 'VBoxManage modifyvm "{name}" --memory 4096 --cpus 2' }
    ],
    general: [
      { title: 'Lister les machines', cmd: 'VBoxManage list vms' },
      { title: 'Machines en cours d\'exécution', cmd: 'VBoxManage list runningvms' },
      { title: 'Réseaux host-only', cmd: 'VBoxManage list hostonlyifs' },
      { title: 'Types de systèmes connus', cmd: 'VBoxManage list ostypes' },
      { title: 'Importer une OVA', cmd: 'VBoxManage import "<chemin>.ova"' }
    ]
  },

  vmware: {
    vm: [
      { title: 'Démarrer sans fenêtre', cmd: 'vmrun -T ws start "{id}" nogui' },
      { title: 'Adresse IP de l\'invité', desc: 'VMware Tools requis', cmd: 'vmrun -T ws getGuestIPAddress "{id}" -wait' },
      { title: 'Lister les instantanés', cmd: 'vmrun -T ws listSnapshots "{id}"' },
      { title: 'Restaurer un instantané', cmd: 'vmrun -T ws revertToSnapshot "{id}" "<nom>"', danger: true },
      { title: 'Supprimer un instantané', cmd: 'vmrun -T ws deleteSnapshot "{id}" "<nom>"', danger: true },
      { title: 'Cloner (complet)', cmd: 'vmrun -T ws clone "{id}" "<destination>.vmx" full -cloneName="<nom>"' },
      { title: 'Copier un fichier vers l\'invité', cmd: 'vmrun -T ws -gu <utilisateur> -gp <motdepasse> copyFileFromHostToGuest "{id}" "<fichier hôte>" "<fichier invité>"' },
      { title: 'Lancer un programme dans l\'invité', cmd: 'vmrun -T ws -gu <utilisateur> -gp <motdepasse> runProgramInGuest "{id}" "<programme>"' }
    ],
    general: [
      { title: 'Machines en cours d\'exécution', cmd: 'vmrun -T ws list' }
    ]
  },

  hyperv: {
    shell: 'powershell',
    vm: [
      { title: 'Infos de la machine', cmd: 'Get-VM -Name "{name}" | Format-List *' },
      { title: 'Démarrer', cmd: 'Start-VM -Name "{name}"' },
      { title: 'Arrêter (invité)', cmd: 'Stop-VM -Name "{name}"' },
      { title: 'Forcer l\'arrêt', cmd: 'Stop-VM -Name "{name}" -TurnOff -Force', danger: true },
      { title: 'Ouvrir la console graphique', desc: 'Fenêtre vmconnect', cmd: 'vmconnect.exe localhost "{name}"', shell: 'native' },
      { title: 'Adresse IP', desc: 'Services d\'intégration requis', cmd: 'Get-VMNetworkAdapter -VMName "{name}" | Select-Object -ExpandProperty IPAddresses' },
      { title: 'Créer un point de contrôle', cmd: 'Checkpoint-VM -Name "{name}" -SnapshotName "<nom>"' },
      { title: 'Lister les points de contrôle', cmd: 'Get-VMSnapshot -VMName "{name}"' },
      { title: 'Restaurer un point de contrôle', cmd: 'Restore-VMSnapshot -VMName "{name}" -Name "<nom>" -Confirm:$false', danger: true },
      { title: 'Changer la RAM', desc: 'Machine éteinte', cmd: 'Set-VMMemory -VMName "{name}" -StartupBytes 4GB' },
      { title: 'Changer le nombre de CPU', desc: 'Machine éteinte', cmd: 'Set-VMProcessor -VMName "{name}" -Count 2' },
      { title: 'Exporter la machine', cmd: 'Export-VM -Name "{name}" -Path "<dossier>"' }
    ],
    general: [
      { title: 'Lister les machines', cmd: 'Get-VM' },
      { title: 'Commutateurs virtuels', cmd: 'Get-VMSwitch' },
      { title: 'Importer une machine', cmd: 'Import-VM -Path "<dossier>\\<machine>\\Virtual Machines\\<GUID>.vmcx"' }
    ]
  },

  libvirt: {
    vm: [
      { title: 'Infos de la machine', cmd: 'virsh dominfo "{name}"' },
      { title: 'Adresse IP', cmd: 'virsh domifaddr "{name}"' },
      { title: 'Console série', desc: 'Quitter avec Ctrl+]', cmd: 'virsh console "{name}"' },
      { title: 'Fenêtre graphique', cmd: 'virt-viewer "{name}"' },
      { title: 'Lister les instantanés', cmd: 'virsh snapshot-list "{name}"' },
      { title: 'Restaurer un instantané', cmd: 'virsh snapshot-revert "{name}" "<nom>"', danger: true },
      { title: 'Disques de la machine', cmd: 'virsh domblklist "{name}"' },
      { title: 'Démarrage automatique au boot', cmd: 'virsh autostart "{name}"' },
      { title: 'Voir la configuration XML', cmd: 'virsh dumpxml "{name}"' },
      { title: 'Modifier la configuration', cmd: 'virsh edit "{name}"' },
      { title: 'Cloner', cmd: 'virt-clone --original "{name}" --name "{name}-clone" --auto-clone' }
    ],
    general: [
      { title: 'Toutes les machines', cmd: 'virsh list --all' },
      { title: 'Réseaux virtuels', cmd: 'virsh net-list --all' },
      { title: 'Pools de stockage', cmd: 'virsh pool-list --all' },
      { title: 'Vérifier la virtualisation matérielle', cmd: 'egrep -c \'(vmx|svm)\' /proc/cpuinfo' }
    ]
  },

  wsl: {
    vm: [
      { title: 'Ouvrir un shell dans cette distribution', cmd: 'wsl -d "{name}"' },
      { title: 'Shell en root', cmd: 'wsl -d "{name}" -u root' },
      { title: 'Exécuter une commande', cmd: 'wsl -d "{name}" -- <commande>' },
      { title: 'Adresse IP', cmd: 'wsl -d "{name}" hostname -I' },
      { title: 'Arrêter cette distribution', cmd: 'wsl --terminate "{name}"' },
      { title: 'Définir par défaut', cmd: 'wsl --set-default "{name}"' },
      { title: 'Passer en WSL 2', cmd: 'wsl --set-version "{name}" 2' },
      { title: 'Exporter (sauvegarde .tar)', cmd: 'wsl --export "{name}" "<chemin>.tar"' },
      { title: 'Désinstaller la distribution', desc: 'Supprime toutes ses données', cmd: 'wsl --unregister "{name}"', danger: true }
    ],
    general: [
      { title: 'Distributions et état', cmd: 'wsl -l -v' },
      { title: 'Distributions installables', cmd: 'wsl -l -o' },
      { title: 'Installer une distribution', cmd: 'wsl --install -d <Ubuntu>' },
      { title: 'Tout arrêter (WSL entier)', cmd: 'wsl --shutdown', danger: true },
      { title: 'Mettre WSL à jour', cmd: 'wsl --update' },
      { title: 'Importer une sauvegarde', cmd: 'wsl --import <nom> "<dossier installation>" "<chemin>.tar"' }
    ]
  },

  docker: {
    vm: [
      { title: 'Journaux en direct', cmd: 'docker logs -f --tail 100 {name}' },
      { title: 'Shell dans le conteneur', cmd: 'docker exec -it {name} sh' },
      { title: 'Détails (JSON)', cmd: 'docker inspect {name}' },
      { title: 'Consommation CPU / RAM', cmd: 'docker stats --no-stream {name}' },
      { title: 'Processus du conteneur', cmd: 'docker top {name}' },
      { title: 'Copier un fichier depuis le conteneur', cmd: 'docker cp {name}:<chemin conteneur> <destination>' },
      { title: 'Créer une image depuis le conteneur', cmd: 'docker commit {name} <image>:<tag>' },
      { title: 'Supprimer le conteneur', cmd: 'docker rm -f {name}', danger: true }
    ],
    general: [
      { title: 'Tous les conteneurs', cmd: 'docker ps -a' },
      { title: 'Images', cmd: 'docker images' },
      { title: 'Espace disque utilisé', cmd: 'docker system df' },
      { title: 'Lancer un conteneur Nginx', cmd: 'docker run -d --name web -p 8080:80 nginx' },
      { title: 'Nettoyer les conteneurs arrêtés', cmd: 'docker container prune', danger: true },
      { title: 'Projets Compose', cmd: 'docker compose ls' }
    ]
  },

  multipass: {
    vm: [
      { title: 'Ouvrir un shell', cmd: 'multipass shell {name}' },
      { title: 'Exécuter une commande', cmd: 'multipass exec {name} -- <commande>' },
      { title: 'Infos (IP, disque, charge)', cmd: 'multipass info {name}' },
      { title: 'Monter un dossier de l\'hôte', cmd: 'multipass mount "<dossier hôte>" {name}:<dossier invité>' },
      { title: 'Transférer un fichier vers la VM', cmd: 'multipass transfer "<fichier>" {name}:<destination>' },
      { title: 'Lister les instantanés', cmd: 'multipass list --snapshots' },
      { title: 'Restaurer un instantané', cmd: 'multipass restore {name}.<instantané>', danger: true },
      { title: 'Supprimer la VM (définitif)', cmd: 'multipass delete {name} && multipass purge', danger: true }
    ],
    general: [
      { title: 'Lister les VM', cmd: 'multipass list' },
      { title: 'Images disponibles', cmd: 'multipass find' },
      { title: 'Créer une VM Ubuntu', cmd: 'multipass launch 24.04 --name <nom> --cpus 2 --memory 4G --disk 20G' },
      { title: 'Réseaux disponibles', cmd: 'multipass networks' }
    ]
  }
};
